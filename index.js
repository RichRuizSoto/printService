require("dotenv").config();

const io = require("socket.io-client");
const net = require("net");

/* =========================
   CONFIGURACIÓN
========================= */

const BACKEND_URL = process.env.BACKEND_URL;
const RESTAURANTE_ID = Number(process.env.RESTAURANTE_ID);
const API_KEY = process.env.API_KEY;

const PRINTER_IP = process.env.PRINTER_IP;
const PRINTER_PORT = Number(process.env.PRINTER_PORT);

/* =========================
   LOG INICIAL
========================= */

console.log("🧾 ===============================");
console.log("🧾 Printer Service iniciado");
console.log("🕒 Fecha:", new Date().toLocaleString());
console.log("🔧 Configuración cargada:");
console.log({
  BACKEND_URL,
  RESTAURANTE_ID,
  PRINTER_IP,
  PRINTER_PORT,
});
console.log("🧾 ===============================");

/* =========================
   SOCKET.IO
========================= */

console.log("🔌 Intentando conectar con backend...");

const socket = io(BACKEND_URL, {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  timeout: 10000,
  transports: ["polling", "websocket"],
});

socket.on("connect", () => {
  console.log("🟢 Socket conectado");
  console.log("🆔 Socket ID:", socket.id);
  console.log(`🔑 Registrando impresora para restaurante ${RESTAURANTE_ID}`);

  socket.emit("registrarImpresora", {
    restauranteId: RESTAURANTE_ID,
    apiKey: API_KEY,
  });

  console.log("📤 Evento registrarImpresora enviado");
});

socket.on("connect_error", (err) => {
  console.error("❌ Error de conexión Socket.IO");
  console.error("📛 Mensaje:", err.message);
});

socket.on("reconnect_attempt", (attempt) => {
  console.warn(`🔄 Reintentando conexión (${attempt})...`);
});

socket.on("disconnect", (reason) => {
  console.warn("🔴 Socket desconectado");
  console.warn("📛 Razón:", reason);
});

/* =========================
   EVENTO DE IMPRESIÓN
========================= */

socket.on("printPedido", (pedido) => {
  console.log("🖨️ ===============================");
  console.log("🖨️ Pedido recibido para impresión");
  console.log("🧾 Número de orden:", pedido.numero_orden);
  console.log("🏪 Restaurante:", pedido.restaurante);
  console.log("🍽️ Tipo de servicio:", pedido.tipo_servicio);
  console.log("📦 Productos:", pedido.productos?.length || 0);
  console.log("💬 Comentario:", pedido.comentario || "N/A");
  console.log("💰 Total:", pedido.total);
  console.log("🖨️ ===============================");

  imprimirPedido(pedido);
});

/* =========================
   FUNCIÓN DE IMPRESIÓN
========================= */

function imprimirPedido(pedido) {
  console.log(`🌐 Conectando a impresora ${PRINTER_IP}:${PRINTER_PORT}`);

  const client = new net.Socket();
  client.setTimeout(5000);

  client.connect(PRINTER_PORT, PRINTER_IP, () => {
    console.log("✅ Conexión TCP con impresora establecida");

    let texto = "";

    texto += "\x1B\x40";
    texto += "\x1B\x61\x01";
    texto += `PEDIDO #${pedido.numero_orden}\n`;
    texto += `${pedido.restaurante}\n`;
    texto += `${pedido.tipo_servicio.toUpperCase()}\n\n`;
    texto += "\x1B\x61\x00";

    pedido.productos.forEach((p, index) => {
      console.log(
        `📄 Producto ${index + 1}: ${p.cantidad}x ${p.nombre}`
      );

      texto += `${p.cantidad}x ${p.nombre}\n`;

      if (Array.isArray(p.extras)) {
        p.extras.forEach((e) => {
          console.log(`   ➕ Extra: ${e.nombre}`);
          texto += `  + ${e.nombre}\n`;
        });
      }
    });

    if (pedido.comentario) {
      console.log("💬 Agregando comentario a impresión");
      texto += "\n--- COMENTARIO ---\n";
      texto += pedido.comentario + "\n";
    }

    texto += `\nTOTAL: ₡${pedido.total}\n\n`;
    texto += "\x1D\x56\x00";

    console.log("📤 Enviando datos a la impresora...");
    console.log("📏 Bytes enviados:", Buffer.byteLength(texto));

    client.write(texto, () => {
      console.log("✅ Datos enviados correctamente a la impresora");
      client.end();
    });
  });

  client.on("timeout", () => {
    console.error("⏱️ Timeout: la impresora no respondió");
    client.destroy();
  });

  client.on("error", (err) => {
    console.error("❌ Error TCP durante impresión");
    console.error("📛 Código:", err.code);
    console.error("📛 Mensaje:", err.message);
  });

  client.on("close", () => {
    console.log("🔌 Conexión con impresora cerrada");
  });
}
