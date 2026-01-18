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
    texto += "\x1B\x74\x00";

    texto += limpiarTexto(pedido.restaurante) + "\n";
    texto += `PEDIDO #${limpiarTexto(String(pedido.numero_orden))}\n`;

    if (pedido.tipo_servicio === "restaurante") {
      texto += `MESA ${limpiarTexto(String(pedido.mesa || ""))}\n`;
    } else {
      texto += limpiarTexto(pedido.tipo_servicio) + "\n";
    }
texto += 
  new Date().toLocaleString("es-CR", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
+ "\n";


    texto += "-----------------------------\n";
    texto += "\x1B\x61\x00";

    if (pedido.nombre) texto += `CLIENTE: ${limpiarTexto(pedido.nombre)}\n`;
    if (pedido.telefono) texto += `TEL: ${limpiarTexto(pedido.telefono)}\n`;

    if (pedido.tipo_servicio === "delivery" && pedido.direccion) {
      texto += "DIRECCION:\n";
      texto += limpiarTexto(pedido.direccion) + "\n";
    }

    texto += "-----------------------------\n";

    pedido.productos.forEach((p) => {
      texto += ` ${limpiarTexto(p.nombre)}\n`;

      if (Array.isArray(p.extras) && p.extras.length) {
        p.extras.forEach((e) => {
          texto += `   + ${limpiarTexto(e.nombre)} (${e.porcion || 1})\n`;
        });
      }
    });

    texto += "-----------------------------\n";

    if (pedido.comentario) {
      texto += "COMENTARIOS:\n";
      texto += limpiarTexto(pedido.comentario) + "\n";
      texto += "-----------------------------\n";
    }

    if (typeof pedido.subtotal === "number") {
      texto += `SUBTOTAL: ${limpiarTexto(String(pedido.subtotal))}\n`;
    }

    if (pedido.precio_delivery > 0) {
      texto += `DELIVERY: ${limpiarTexto(String(pedido.precio_delivery))}\n`;
    }

    if (pedido.descuento > 0) {
      texto += `DESCUENTO: -${limpiarTexto(String(pedido.descuento))}\n`;
    }

    texto += "-----------------------------\n";

    texto += "\x1B\x21\x30";
    texto += `TOTAL: ${limpiarTexto(String(pedido.total))} COLONES\n`;
    texto += "\x1B\x21\x00";

    if (pedido.metodo_pago) {
      texto += `PAGO: ${limpiarTexto(pedido.metodo_pago)}\n`;
    }

    texto += "-----------------------------\n";
    texto += "\x1B\x61\x01";
    texto += "GRACIAS POR SU COMPRA\n";
    texto += "\n\n\n\n";
    texto += "\x1D\x56\x42\x00";

    console.log("📤 Enviando datos a la impresora...");
    console.log("📏 Bytes enviados:", Buffer.byteLength(texto));

    client.write(texto, () => {
      console.log("✅ Factura enviada correctamente");
      client.end();
    });
  });

  client.on("timeout", () => {
    console.error("⏱️ Timeout impresora");
    client.destroy();
  });

  client.on("error", (err) => {
    console.error("❌ Error TCP impresión");
    console.error(err.message);
  });

  client.on("close", () => {
    console.log("🔌 Conexión cerrada");
  });
}

function limpiarTexto(texto) {
  if (!texto) return "";
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s\+\-\.,:]/gi, "")
    .toUpperCase();
}
