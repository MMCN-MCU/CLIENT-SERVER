// net : 네트워크 관련 작업 수행 모듈
// fs : 파일 시스템 작업 수행 모듈
// os : 로컬 네트워크 상에서 할당 받은 IP 주소 얻어옴
const net = require("net");
const fs = require("fs");
const os = require("os");

// 서버가 사용할 포트를 3000으로 설정합니다.
const port = 3000;

// TCP 서버를 생성합니다.
const server = net.createServer();

// 'size'는 전송된 이미지 데이터의 크기를 저장하며,
// 'data'는 수신된 이미지 데이터를 저장하는 Buffer입니다.
let size = 0;
let data = Buffer.alloc(0);

// 클라이언트가 서버에 연결하면 실행될 콜백 함수입니다.
server.on("connection", (socket) => {
  console.log("New client connected");

  // 데이터를 받으면 실행될 콜백 함수입니다.
  socket.on("data", (chunk) => {
    // 첫 번째 4바이트는 이미지 데이터의 크기입니다.
    if (size === 0 && chunk.length >= 4) {
      size = chunk.readUInt32BE(0);
      chunk = chunk.slice(4);
    }

    // 이미지 데이터를 'data' Buffer에 추가합니다.
    data = Buffer.concat([data, chunk]);

    // 충분한 데이터를 받았는지 확인합니다.
    // 데이터를 파일에 쓰고 다음 이미지를 위해 준비합니다.
    if (data.length >= size) {
      fs.writeFile("output.jpg", data.slice(0, size), (err) => {
        if (err) throw err;
        console.log("Frame saved!");
      });

      // 다음 이미지를 위해 준비합니다.
      data = data.slice(size);
      size = 0;
    }
  });

  // 클라이언트가 연결을 끊으면 실행될 콜백 함수입니다.
  socket.on("end", () => {
    console.log("Client disconnected");
  });
});

// 서버가 지정된 포트에서 리스닝하게 합니다.
server.listen(port, () => {
  const interfaces = os.networkInterfaces();
  const addresses = Object.keys(interfaces)
    .reduce((results, name) => results.concat(interfaces[name]), [])
    .filter((iface) => iface.family === "IPv4" && !iface.internal)
    .map((iface) => iface.address);
  const address = addresses.length > 0 ? addresses[0] : "localhost";

  // 현재 LocalHost IP 주소와 Port 번호 노출
  console.log(`Server listening on ${address}:${port}`);
});
