// 필요한 모듈 import
const express = require("express");
const net = require("net");
const fs = require("fs");
const os = require("os");
const path = require("path");
const port = 3000;
const app = express();
const server = net.createServer();

// NAT 상에서 LocalHost IP 주소 알아옴
const interfaces = os.networkInterfaces();
const addresses = Object.keys(interfaces)
  .reduce((results, name) => results.concat(interfaces[name]), [])
  .filter((iface) => iface.family === "IPv4" && !iface.internal)
  .map((iface) => iface.address);
const IP = addresses.length > 0 ? addresses[0] : "localhost";

// 미디어 디바이스 연결 정보
let connectionCounter = 0;
let connections = [];

// pug template 파일 위치 지정
app.set("views", path.join(__dirname, "views"));

// pug template engine을 ssr 위해 적용
app.set("view engine", "pug");

// 정적 파일 제공하는 미들웨어 설정
app.use(express.static(path.join(__dirname, "public")));

// Express 서버 설정
app.get("/", (req, res) => {
  // 동적으로 페이지 생성
  res.render("index", {
    connections: Object.keys(connections),
    IP,
    port,
    hasVideo: false,
  });
});

// 비디오 id 종류 받아오기
app.get("/videos/count", (req, res) => {
  res.send(JSON.stringify(Object.keys(connections)));
});

// 비디오 데이터 (프레임 단위 이미지 데이터) 송신
app.get("/videos/:id", (req, res) => {
  let id = req.params.id;
  if (!connections[id]) {
    res.status(404).send("Not found");
    return;
  }

  res.sendFile(__dirname + `/videos/${id}.jpg`);
});

// HTTP 연결 포트 정의
app.listen(port, () => {
  console.log(`Web server listening on ${IP}:${port}`);
});

// TCP socket 통신 포트 정의
server.listen(port + 1, () => {
  // 현재 LocalHost IP 주소와 Port 번호 노출
  console.log(`TCP Server listening on ${IP}:${port + 1}`);
});

// TCP 서버 설정 (3001 번 포트로 열려있다)
server.on("connection", (socket) => {
  // 새로운 클라이언트가 연결될 때마다 로그를 출력합니다.
  console.log("New client connected");

  // connection 수 갱신
  let id = connectionCounter++;

  // 새로운 Connection 생성
  connections[id] = { size: 0, data: Buffer.alloc(0) };
  console.log(`New client connected: ${id}`);

  // data 수신 시에 호출 (새로운 프레임 데이터 수신 시마다 실행)
  socket.on("data", (chunk) => {
    // size가 0, chunk 길이 4 이상인 경우, chunck에서 size 값 읽어옴 -> connections[id].size에 값 넣음
    if (connections[id].size === 0 && chunk.length >= 4) {
      connections[id].size = chunk.readUInt32BE(0);
      chunk = chunk.slice(4);
    }

    // connections[id].data에 수신한 프레임 데이터 chunk 추가
    connections[id].data = Buffer.concat([connections[id].data, chunk]);

    // connections[id].data에 저장된 데이터 사이즈가 충분한 경우 /videos 폴더에 이미지 데이터 추가 (id.jpg 로 저장)
    if (connections[id].data.length >= connections[id].size) {
      fs.writeFile(
        `./videos/${id}.jpg`,
        connections[id].data.slice(0, connections[id].size),
        (err) => {
          if (err) throw err;
          console.log(`Frame saved for client ${id}!`);
        }
      );

      // connections[id].data에 저장된 내용 frame 사이즈 만큼 slice 쳐서 버리기
      connections[id].data = connections[id].data.slice(connections[id].size);

      // 새로운 frame 데이터 받아들이기 위해 connections[id].size 값 초기화
      connections[id].size = 0;
    }
  });

  // 클라이언트 연결이 끊어졌을 때 로그를 출력합니다.
  socket.on("end", () => {
    // 파일 삭제
    fs.unlink(`./videos/${id}.jpg`, (err) => {
      if (err) console.log(err);
      else console.log("file erased successfully");
    });
    // connections 객체 목록에서 제거
    delete connections[id];
    console.log(`Client disconnected: ${id}`);
  });
});
