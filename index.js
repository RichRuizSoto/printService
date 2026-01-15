require("dotenv").config();

const io = require("socket.io-client");
const net = require("net");

const BACKEND_URL = process.env.BACKEND_URL;
const RESTAURANTE_ID = Number(process.env.RESTAURANTE_ID);
const API_KEY = process.env.API_KEY;

const PRINTER_IP = process.env.PRINTER_IP;
const PRINTER_PORT = Number(process.env.PRINTER_PORT);

console.log("🧾 Printer Service iniciado");
console.log("🔧 Configuración:", {
  BACKEND_URL,
  RESTAURANTE_ID,
  PRINTER_IP,
  PRINTER_PORT,
});

const socket = io(BACKEND_URL, {
  reconnection: true,
  reconnectionDelay: 2000,
  transports: ["polling", "websocket"],
});

socket.on("connect", () => {
  console.log("🟢 Conectado al backend");
  console.log(`🔑 Registrando impresora para restaurante ${RESTAURANTE_ID}`);

  socket.emit("registrarImpresora", {
    restauranteId: RESTAURANTE_ID,
    apiKey: API_KEY,
  });
});

socket.on("connect_error", (err) => {
  console.error("❌ Error de conexión Socket.IO:", err.message);
});

socket.on("printPedido", (pedido) => {
  console.log("🖨️ Pedido recibido para impresión");
  console.log(`🧾 Pedido #${pedido.numero_orden}`);

  imprimirPedido(pedido);
});

socket.on("disconnect", (reason) => {
  console.warn("🔴 Desconectado del backend:", reason);
});

function imprimirPedido(pedido) {
  console.log(`🌐 Conectando a impresora ${PRINTER_IP}:${PRINTER_PORT}`);

  const client = new net.Socket();
  client.setTimeout(5000);

  client.connect(PRINTER_PORT, PRINTER_IP, () => {
    let texto = "";

    texto += "\x1B\x40";
    texto += "\x1B\x61\x01";
    texto += `PEDIDO #${pedido.numero_orden}\n`;
    texto += `${pedido.restaurante}\n`;
    texto += `${pedido.tipo_servicio.toUpperCase()}\n\n`;
    texto += "\x1B\x61\x00";

    pedido.productos.forEach((p) => {
      texto += `${p.cantidad}x ${p.nombre}\n`;
      if (Array.isArray(p.extras)) {
        p.extras.forEach((e) => {
          texto += `  + ${e.nombre}\n`;
        });
      }
    });

    if (pedido.comentario) {
      texto += "\n--- COMENTARIO ---\n";
      texto += pedido.comentario + "\n";
    }

    texto += `\nTOTAL: ₡${pedido.total}\n\n`;
    texto += "\x1D\x56\x00";

    client.write(texto, () => client.end());
  });

  client.on("timeout", () => client.destroy());
  client.on("error", (err) =>
    console.error("❌ Error TCP impresión:", err.message)
  );
}
