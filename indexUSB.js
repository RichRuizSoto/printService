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
console.log("🔎 ENV:", { BACKEND_URL, RESTAURANTE_SLUG, API_KEY });
console.log("🖨️ Impresora configurada:", PRINTER_NAME);

// ================= SOCKET =================

const socket = io(BACKEND_URL, {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  timeout: 10000,
  transports: ["polling", "websocket"],
});

socket.on("connect", () => {
  console.log("🟢 Conectado al backend");
  console.log("🆔 Socket ID:", socket.id);

  socket.emit("registrarImpresora", {
    restauranteSlug: RESTAURANTE_SLUG,
    apiKey: API_KEY,
  });
});

socket.on("connect_error", (err) => {
  console.error("❌ Error de conexión socket:", err.message);
});

socket.on("printPedido", pedido => {
  console.log("==================================================");
  console.log("📦 Pedido recibido completo:");
  console.log(JSON.stringify(pedido, null, 2));
  console.log("--------------------------------------------------");
  console.log("🧾 imprimir_factura:", pedido.imprimir_factura, "| tipo:", typeof pedido.imprimir_factura);
  console.log("💳 metodo_pago:", pedido.metodo_pago);

  if (
    pedido.metodo_pago &&
    pedido.metodo_pago.toLowerCase() === "efectivo"
  ) {
    console.log("💰 Método efectivo detectado → intentando abrir caja");
    abrirCaja();
  }

  if (pedido.imprimir_factura === true) {
    console.log("🖨️ Pedido marcado como imprimible");
    imprimirPedido(pedido);
  } else {
    console.log("🛑 Pedido marcado como NO imprimible");
  }
});

// ================= IMPRESIÓN =================

function imprimirPedido(pedido) {
  try {
    console.log("🚀 Iniciando proceso de impresión...");

    const tempFile = `ticket_${Date.now()}.txt`;
    const CUT = "\x1D\x56\x00";

    let ticket = "";

    ticket += "\x1B\x61\x01";
    ticket += limpiarTexto(pedido.restaurante) + "\n";
    ticket += `TEL: ${TELEFONO_RESTAURANTE}\n\n`;

    ticket += "\x1D\x21\x11";
    ticket += `PEDIDO #${pedido.numero_orden}\n`;
    ticket += "\x1D\x21\x00";

    ticket += (pedido.tipo_servicio || "").toUpperCase() + "\n";

    ticket += new Date().toLocaleString("es-CR", {
      timeZone: "America/Costa_Rica",
      hour12: false,
    }) + "\n";

    ticket += "--------------------------------\n";
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

    if (!Array.isArray(pedido.productos)) {
      console.error("❌ pedido.productos NO es un arreglo");
      return;
    }

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

    ticket += "\x1B\x61\x01";

    ticket += "\x1D\x21\x11";
    ticket += `TOTAL: ${pedido.total}  \n`;
    ticket += "\x1D\x21\x00";

    if (pedido.metodo_pago)
      ticket += `PAGO: ${limpiarTexto(pedido.metodo_pago)}\n`;

    ticket += "\nGRACIAS POR SU COMPRA\n";
    ticket += `   \n\n\n`;
    ticket += CUT;

    console.log("📄 Escribiendo archivo temporal:", tempFile);

    fs.writeFileSync(tempFile, ticket, "binary");

    const stats = fs.statSync(tempFile);
    console.log("📦 Tamaño archivo:", stats.size, "bytes");

    const command = `copy /b ${tempFile} \\\\localhost\\${PRINTER_NAME}`;
    console.log("🖥️ Ejecutando comando:", command);

    exec(command, (error, stdout, stderr) => {
      console.log("📤 STDOUT:", stdout);
      console.log("📤 STDERR:", stderr);

      if (error) {
        console.error("❌ Error al imprimir:", error);
      } else {
        console.log("✅ Pedido impreso correctamente");
      }

      try {
        fs.unlinkSync(tempFile);
        console.log("🗑️ Archivo temporal eliminado");
      } catch (e) {
        console.error("⚠ No se pudo borrar el archivo temporal:", e.message);
      }
    });

  } catch (err) {
    console.error("❌ Error general impresión:", err);
  }
}

function abrirCaja() {
  try {
    console.log("💰 Abriendo caja de efectivo...");

    const tempFile = `open_cash_${Date.now()}.txt`;
    const OPEN_DRAWER = "\x1B\x70\x00\x19\xFA";

    fs.writeFileSync(tempFile, OPEN_DRAWER, "binary");

    const command = `copy /b ${tempFile} \\\\localhost\\${PRINTER_NAME}`;
    console.log("🖥️ Ejecutando comando caja:", command);

    exec(command, (error, stdout, stderr) => {
      console.log("📤 STDOUT CAJA:", stdout);
      console.log("📤 STDERR CAJA:", stderr);

      if (error) {
        console.error("❌ Error al abrir caja:", error);
      } else {
        console.log("✅ Caja abierta correctamente");
      }

      try {
        fs.unlinkSync(tempFile);
        console.log("🗑️ Archivo caja eliminado");
      } catch (e) {
        console.error("⚠ No se pudo borrar archivo caja:", e.message);
      }
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