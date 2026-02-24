require("dotenv").config();

const fs = require("fs");
const { exec } = require("child_process");
const io = require("socket.io-client");

const BACKEND_URL = process.env.BACKEND_URL;
const RESTAURANTE_SLUG = process.env.RESTAURANTE_SLUG;
const API_KEY = process.env.API_KEY;

const PRINTER_NAME = "POS-58";
const TELEFONO_RESTAURANTE = "62953040";

console.log("🧾 Printer Service iniciado");

// ================= SOCKET =================

const socket = io(BACKEND_URL, {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  timeout: 10000,
  transports: ["polling", "websocket"],
});

socket.on("connect", () => {
  console.log("🟢 Conectado", socket.id);

  socket.emit("registrarImpresora", {
    restauranteSlug: RESTAURANTE_SLUG,
    apiKey: API_KEY,
  });
});

// socket.on("printPedido", pedido => {
//   console.log("🖨️ Pedido recibido:", pedido.numero_orden);
//   imprimirPedido(pedido);
// });

socket.on("printPedido", pedido => {
  console.log("📦 Pedido recibido:", pedido.numero_orden);

  // 1️⃣ Siempre revisar método de pago
  if (
    pedido.metodo_pago &&
    pedido.metodo_pago.toLowerCase() === "efectivo"
  ) {
    abrirCaja();
  }

  // 2️⃣ Solo imprimir si imprimir_factura es true
  if (pedido.imprimir_factura === true) {
    imprimirPedido(pedido);
  } else {
    console.log("🛑 Pedido marcado como NO imprimible");
  }
});

// ================= IMPRESIÓN =================

function imprimirPedido(pedido) {
  try {
    const tempFile = `ticket_${Date.now()}.txt`;
    const CUT = "\x1D\x56\x00";

    let ticket = "";

    // Centrado general
    ticket += "\x1B\x61\x01"; // align center

    // ENCABEZADO
    ticket += limpiarTexto(pedido.restaurante) + "\n";
    ticket += `TEL: ${TELEFONO_RESTAURANTE}\n\n`;

    // PEDIDO GRANDE
    ticket += "\x1D\x21\x11"; // tamaño grande (doble ancho + alto)
    ticket += `PEDIDO #${pedido.numero_orden}\n`;
    ticket += "\x1D\x21\x00"; // tamaño normal

    ticket += (pedido.tipo_servicio || "").toUpperCase() + "\n";

    ticket += new Date().toLocaleString("es-CR", {
      timeZone: "America/Costa_Rica",
      hour12: false,
    }) + "\n";

    ticket += "--------------------------------\n";

    // Alinear izquierda para productos
    ticket += "\x1B\x61\x00";

    if (pedido.nombre)
      ticket += `CLIENTE: ${limpiarTexto(pedido.nombre)}\n`;

    if (pedido.telefono)
      ticket += `TEL CLIENTE: ${limpiarTexto(pedido.telefono)}\n`;

    if (pedido.tipo_servicio === "delivery" && pedido.direccion) {
      ticket += "DIRECCION:\n";
      ticket += limpiarTexto(pedido.direccion) + "\n";
    }

    ticket += "--------------------------------\n";

    pedido.productos.forEach(p => {
      ticket += ` ${limpiarTexto(p.nombre)}\n`;

      if (Array.isArray(p.extras)) {
        p.extras.forEach(e => {
          ticket += `   + ${limpiarTexto(e.nombre)} (${e.porcion || 1})\n`;
        });
      }
    });

    ticket += "--------------------------------\n";

    if (pedido.comentario) {
      ticket += "COMENTARIOS:\n";
      ticket += limpiarTexto(pedido.comentario) + "\n";
      ticket += "--------------------------------\n";
    }

    // Volver a centrar para totales
    ticket += "\x1B\x61\x01";

    // TOTAL GRANDE IGUAL QUE PEDIDO
    ticket += "\x1D\x21\x11";
    ticket += `TOTAL: ${pedido.total}  \n`;
    ticket += "\x1D\x21\x00";

    if (pedido.metodo_pago)
      ticket += `PAGO: ${limpiarTexto(pedido.metodo_pago)}\n`;

    ticket += "\nGRACIAS POR SU COMPRA\n";
    ticket += `   \n\n\n`;

    ticket += CUT;

    fs.writeFileSync(tempFile, ticket, "binary");

    exec(`copy /b ${tempFile} \\\\localhost\\${PRINTER_NAME}`, error => {
      if (error) {
        console.error("❌ Error al imprimir:", error);
      } else {
        console.log("✅ Pedido impreso correctamente");
      }
      fs.unlinkSync(tempFile);
    });

  } catch (err) {
    console.error("❌ Error general impresión:", err);
  }
}

function abrirCaja() {
  try {
    console.log("💰 Abriendo caja de efectivo...");

    const tempFile = `open_cash_${Date.now()}.txt`;

    // Comando ESC/POS para abrir cajón (pin 2)
    const OPEN_DRAWER = "\x1B\x70\x00\x19\xFA";
    // const OPEN_DRAWER = "\x1B\x70\x01\x19\xFA";
    fs.writeFileSync(tempFile, OPEN_DRAWER, "binary");

    exec(`copy /b ${tempFile} \\\\localhost\\${PRINTER_NAME}`, error => {
      if (error) {
        console.error("❌ Error al abrir caja:", error);
      } else {
        console.log("✅ Caja abierta correctamente");
      }
      fs.unlinkSync(tempFile);
    });

  } catch (err) {
    console.error("❌ Error general caja:", err);
  }
}

// ================= UTILIDAD =================

function limpiarTexto(texto) {
  if (!texto) return "";
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s+\-.,:]/gi, "")
    .toUpperCase();
}