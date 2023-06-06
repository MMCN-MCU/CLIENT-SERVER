// 필요한 모듈 import
const express = require("express");
const net = require("net");
const fs = require("fs");
const os = require("os");
const path = require("path");
const port = 3000;
const app = express();
const server = net.createServer();
const Jimp = require("jimp");

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
  console.log(connections, Object.keys(connections));
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

// HTTP 연결 포트 정의 + 0.1초에 한번 씩 이미지 데이터 믹싱
app.listen(port, () => {
  // IP, PORT 보여주기
  console.log(`Web server listening on ${IP}:${port}`);

  // 이미지 믹싱하는 함수
  const mixImages = (imagePaths, jimpImages) => {
    // videos 디렉터리 주소
    const VIDEOS_DIR = "./videos/";

    // 이미지 존재할 때 믹싱
    if (imagePaths.length > 0) {
      // 이미지 로드 및 Jimp 객체 생성
      Promise.all(
        imagePaths.map((imagePath, idx) => {
          return Jimp.read(VIDEOS_DIR + imagePath)
            .then((image) => {
              image.idx = idx;
              jimpImages[jimpImages.length++] = image;
            })
            .catch((err) => {
              console.error(`이미지 로드 중 오류 발생: ${err}`);
            });
        })
      )
        .then(() => {
          // 이미지의 최대 가로와 세로 크기 계산
          const maxWidth = jimpImages.reduce(
            (width, image) => Math.max(width, image.getWidth()),
            0
          );
          const maxHeight = jimpImages.reduce(
            (height, image) => Math.max(height, image.getHeight()),
            0
          );

          // 격자 이미지의 크기 계산
          const gridWidth = maxWidth * 2;
          const gridHeight = maxHeight * Math.ceil(imagePaths.length / 2);

          // 격자 이미지를 담을 Jimp 캔버스 생성
          const mergedImage = new Jimp(gridWidth, gridHeight);

          // 이미지를 격자에 병합
          jimpImages.forEach((image) => {
            const idx = Number(image.idx);
            const column = idx % 2;
            const row = Math.floor(idx / 2);

            const x =
              column * maxWidth + Math.floor((maxWidth - image.getWidth()) / 2);
            const y =
              row * maxHeight + Math.floor((maxHeight - image.getHeight()) / 2);

            mergedImage.blit(image, x, y);
          });

          // 합쳐진 이미지 저장
          mergedImage.write("./videos/mixed.jpg", (err) => {
            if (err) {
              console.error(`이미지 저장 중 오류 발생: ${err}`);
            } else {
              console.log("image mixed");
            }
          });
        })
        .catch((err) => {
          console.error(`이미지 로드 중 오류 발생: ${err}`);
        });
    }
  };

  // 이미지 믹싱 0.1초에 한번
  setInterval(() => {
    const images = fs
      .readdirSync("./videos")
      .filter((image) => image.slice(-3) === "jpg")
      .filter((image) => !image.includes("mixed"));

    // 이미지를 담을 Jimp 객체 배열
    const jimpImages = [];

    // 이미지 믹싱
    mixImages(images, jimpImages);
  }, 2000);
});

// TCP socket 통신 포트 정의
server.listen(port + 1, () => {
  // 현재 LocalHost IP 주소와 Port 번호 노출
  console.log(`TCP Server listening on ${IP}:${port + 1}`);

  setInterval(() => {
    const images = fs
      .readdirSync("./videos")
      .filter((image) => image.slice(-3) === "jpg");
  }, 100);
});

// TCP 서버 설정 (3001 번 포트로 열려있다)
server.on("connection", (socket) => {
  // 새로운 클라이언트가 연결될 때마다 로그를 출력합니다.
  console.log("New client connected");

  // connection 수 갱신, 받은 frame 수 계산
  let id = connectionCounter++;

  // 새로운 Connection 생성
  connections[id] = { size: 0, data: Buffer.alloc(0) };
  console.log(`New client connected: ${id}`);

  socket.on("data", (chunk) => {
    // 현재 연결에 데이터 추가
    connections[id].data = Buffer.concat([connections[id].data, chunk]);

    // 새로운 데이터가 있을 때마다 반복
    while (
      connections[id].data.length >= 4 &&
      connections[id].data.length >= connections[id].size + 4
    ) {
      if (connections[id].size === 0) {
        // 첫 4바이트에서 데이터의 크기를 읽는다 (big endian 순서)
        connections[id].size = connections[id].data.readUInt32BE(0);
      }

      if (connections[id].data.length >= connections[id].size + 4) {
        // 수신한 데이터의 크기가 처음에 읽은 데이터의 크기와 같거나 크다면 (데이터를 모두 수신했다면) 파일을 쓴다.
        // 받아온 데이터의 일부만을 slice로 읽어온다.
        fs.writeFile(
          `./videos/${id}.jpg`,
          connections[id].data.slice(4, connections[id].size + 4),
          (err) => {
            if (err) throw err;
            console.log(`Frame saved for client ${id}!`);
          }
        );

        // 파일로 쓴 부분을 제외한 나머지 데이터를 보관한다
        connections[id].data = connections[id].data.slice(
          connections[id].size + 4
        );

        // 다음 데이터를 위해 데이터의 크기를 다시 0으로 설정한다
        connections[id].size = 0;
      }
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
