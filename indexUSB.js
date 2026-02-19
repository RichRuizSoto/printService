require("dotenv").config();

const io = require("socket.io-client");
const escpos = require("escpos");
escpos.USB = require("escpos-usb");

const BACKEND_URL = process.env.BACKEND_URL;
const RESTAURANTE_SLUG = process.env.RESTAURANTE_SLUG;
const API_KEY = process.env.API_KEY;

console.log("🧾 ===============================");
console.log("🧾 Printer Service iniciado");
console.log("🕒 Fecha:", new Date().toLocaleString());
console.log({ BACKEND_URL, RESTAURANTE_SLUG });
console.log("🧾 ===============================");

const socket = io(BACKEND_URL, {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  timeout: 10000,
  transports: ["polling", "websocket"],
});

socket.on("connect", () => {
  console.log("🟢 Socket conectado", socket.id);
  socket.emit("registrarImpresora", {
    restauranteSlug: RESTAURANTE_SLUG,
    apiKey: API_KEY,
  });
});

socket.on("connect_error", err => {
  console.error("❌ Error Socket.IO", err.message);
});

socket.on("disconnect", reason => {
  console.warn("🔴 Socket desconectado", reason);
});

socket.on("printPedido", pedido => {
  console.log("🖨️ Pedido recibido", pedido.numero_orden);
  imprimirPedido(pedido);
});

function imprimirPedido(pedido) {
  const device = new escpos.USB();
  const printer = new escpos.Printer(device);

  device.open(error => {
    if (error) {
      console.error("❌ Error impresora USB", error);
      return;
    }

    printer
      .align("CT")
      .text(limpiarTexto(pedido.restaurante))
      .text(`PEDIDO #${limpiarTexto(String(pedido.numero_orden))}`);

    if (pedido.tipo_servicio === "restaurante") {
      printer.text(`MESA ${limpiarTexto(String(pedido.mesa || ""))}`);
    } else {
      printer.text(limpiarTexto(pedido.tipo_servicio));
    }

    printer.text(
      new Date().toLocaleString("es-CR", {
        timeZone: "America/Costa_Rica",
        hour12: false,
      })
    );

    printer.text("-----------------------------");
    printer.align("LT");

    if (pedido.nombre)
      printer.text(`CLIENTE: ${limpiarTexto(pedido.nombre)}`);
    if (pedido.telefono)
      printer.text(`TEL: ${limpiarTexto(pedido.telefono)}`);

    if (pedido.tipo_servicio === "delivery" && pedido.direccion) {
      printer.text("DIRECCION:");
      printer.text(limpiarTexto(pedido.direccion));
    }

    printer.text("-----------------------------");

    pedido.productos.forEach(p => {
      printer.text(` ${limpiarTexto(p.nombre)}`);
      if (Array.isArray(p.extras)) {
        p.extras.forEach(e => {
          printer.text(
            `   + ${limpiarTexto(e.nombre)} (${e.porcion || 1})`
          );
        });
      }
    });

    printer.text("-----------------------------");

    if (pedido.comentario) {
      printer.text("COMENTARIOS:");
      printer.text(limpiarTexto(pedido.comentario));
      printer.text("-----------------------------");
    }

    if (typeof pedido.subtotal === "number")
      printer.text(`SUBTOTAL: ${limpiarTexto(String(pedido.subtotal))}`);

    if (pedido.precio_delivery > 0)
      printer.text(
        `DELIVERY: ${limpiarTexto(String(pedido.precio_delivery))}`
      );

    if (pedido.descuento > 0)
      printer.text(
        `DESCUENTO: -${limpiarTexto(String(pedido.descuento))}`
      );

    printer.text("-----------------------------");

    printer
      .size(2, 2)
      .text(`TOTAL: ${limpiarTexto(String(pedido.total))} COLONES`)
      .size(1, 1);

    if (pedido.metodo_pago)
      printer.text(`PAGO: ${limpiarTexto(pedido.metodo_pago)}`);

    printer
      .text("-----------------------------")
      .align("CT")
      .text("GRACIAS POR SU COMPRA")
      .feed(4)
      .cut()
      .close();

    console.log("✅ Factura enviada");
  });
}

function limpiarTexto(texto) {
  if (!texto) return "";
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s+\-.,:]/gi, "")
    .toUpperCase();
}
