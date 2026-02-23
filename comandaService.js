require("dotenv").config();

const io = require("socket.io-client");
const net = require("net");

/* =========================
   CONFIGURACIÓN
========================= */

const BACKEND_URL = process.env.BACKEND_URL;
const RESTAURANTE_SLUG = process.env.RESTAURANTE_SLUG;
const API_KEY = process.env.API_KEY;

const PRINTER_IP = process.env.PRINTER_KITCHEN_IP;
const PRINTER_PORT = Number(process.env.PRINTER_PORT || 9100);

// Ajusta según tu impresora:
// 32 = 58mm
// 48 = 80mm
const PAPER_WIDTH = Number(process.env.PAPER_WIDTH || 48);

if (!PRINTER_IP) {
  console.error("❌ PRINTER_KITCHEN_IP no está definido en .env");
  process.exit(1);
}

/* =========================
   LOG INICIAL
========================= */

console.log("🍳 ===================================");
console.log("🍳 Kitchen Comanda Service iniciado");
console.log("🕒 Fecha:", new Date().toLocaleString());
console.log({
  BACKEND_URL,
  RESTAURANTE_SLUG,
  PRINTER_IP,
  PRINTER_PORT,
  PAPER_WIDTH
});
console.log("🍳 ===================================");

/* =========================
   SOCKET.IO
========================= */

const socket = io(BACKEND_URL, {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  timeout: 10000,
  transports: ["polling", "websocket"],
});

socket.on("connect", () => {
  console.log("🟢 Conectado al backend (Cocina)");

  socket.emit("registrarImpresora", {
    restauranteSlug: RESTAURANTE_SLUG,
    apiKey: API_KEY,
    tipo: "cocina",
  });

  console.log("📡 Registrado como impresora de cocina");
});

socket.on("disconnect", (reason) => {
  console.warn("🔴 Socket desconectado:", reason);
});

socket.on("connect_error", (err) => {
  console.error("❌ Error conexión Socket:", err.message);
});

/* =========================
   EVENTO COMANDA
========================= */

socket.on("printPedido", (pedido) => {
  console.log("📥 Nueva comanda recibida");

  if (!pedido || !Array.isArray(pedido.productos)) {
    console.error("❌ Pedido inválido recibido");
    return;
  }

  imprimirComanda(pedido);
});

/* =========================
   FUNCIÓN IMPRESIÓN
========================= */

function imprimirComanda(pedido) {
  console.log(`🌐 Conectando a impresora cocina ${PRINTER_IP}:${PRINTER_PORT}`);

  const client = new net.Socket();
  client.setTimeout(5000);

  client.connect(PRINTER_PORT, PRINTER_IP, () => {
    let texto = "";

    const line = "=".repeat(PAPER_WIDTH);
    const dash = "-".repeat(PAPER_WIDTH);

    // RESET
    texto += "\x1B\x40";

    // BEEP
    texto += "\x1B\x42\x03\x02";

    // =========================
    // ENCABEZADO
    // =========================

    texto += "\x1B\x61\x01"; // center
    texto += "\x1B\x45\x01"; // bold on
    texto += "\x1B\x21\x30"; // doble tamaño
    texto += "COMANDA\n";
    texto += "\x1B\x21\x00";
    texto += "\x1B\x45\x00"; // bold off

    texto += line + "\n";

    // Pedido grande
    texto += "\x1B\x45\x01";
    texto += "\x1B\x21\x30";
    texto += `PEDIDO #${padPedido(pedido.numero_orden)}\n`;
    texto += "\x1B\x21\x00";
    texto += "\x1B\x45\x00";

    texto += line + "\n";

    // Servicio + hora
    texto += "\x1B\x45\x01";
    texto += formatServicio(pedido) + "\n";
    texto += "\x1B\x45\x00";

    texto += obtenerHoraCR() + "\n";

    texto += dash + "\n";

    // =========================
    // PRODUCTOS
    // =========================

    texto += "\x1B\x61\x00"; // izquierda

    const productosAgrupados = agruparProductos(pedido.productos);

    productosAgrupados.forEach((p) => {
      texto += "\n";
      texto += "\x1B\x45\x01"; // bold
      texto += `${p.cantidad}x ${p.nombre}\n`;
      texto += "\x1B\x45\x00";

      if (p.extras.length) {
        p.extras.forEach((e) => {
          texto += `   + ${e}\n`;
        });
      }
    });

    // =========================
    // COMENTARIOS
    // =========================

    if (pedido.comentario) {
      texto += "\n" + dash + "\n";
      texto += "\x1B\x45\x01";
      texto += "COMENTARIOS:\n";
      texto += "\x1B\x45\x00";
      texto += limpiarTexto(pedido.comentario) + "\n";
    }

    texto += "\n\n\n";

    // CORTE PAPEL
    texto += "\x1D\x56\x42\x00";

    client.write(texto, () => {
      console.log("✅ Comanda enviada correctamente");
      client.end();
    });
  });

  client.on("timeout", () => {
    console.error("⏱️ Timeout impresora cocina");
    client.destroy();
  });

  client.on("error", (err) => {
    console.error("❌ Error TCP cocina:", err.message);
  });

  client.on("close", () => {
    console.log("🔌 Conexión cocina cerrada");
  });
}

/* =========================
   HELPERS
========================= */

function agruparProductos(productos) {
  const mapa = {};

  productos.forEach((p) => {
    const nombre = limpiarTexto(p.nombre);
    const key = nombre;

    if (!mapa[key]) {
      mapa[key] = {
        nombre,
        cantidad: 0,
        extras: []
      };
    }

    mapa[key].cantidad += p.cantidad || 1;

    if (Array.isArray(p.extras)) {
      p.extras.forEach((e) => {
        mapa[key].extras.push(limpiarTexto(e.nombre));
      });
    }
  });

  return Object.values(mapa);
}

function formatServicio(pedido) {
  if (pedido.tipo_servicio === "restaurante") {
    return `MESA ${limpiarTexto(String(pedido.mesa || ""))}`;
  }

  return limpiarTexto(pedido.tipo_servicio || "");
}

function obtenerHoraCR() {
  return new Date().toLocaleTimeString("es-CR", {
    timeZone: "America/Costa_Rica",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  });
}

function padPedido(numero) {
  if (!numero) return "000";
  return String(numero).padStart(3, "0");
}

function limpiarTexto(texto) {
  if (!texto) return "";
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s\+\-\.,:]/gi, "")
    .toUpperCase();
}