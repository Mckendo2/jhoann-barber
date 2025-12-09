import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import multer from "multer";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadMemory = multer({ storage: multer.memoryStorage() });

function uploader(folder) {
  return async function (req, res, next) {
    try {
      const files = req.files || (req.file ? [req.file] : []);
      const uploads = await Promise.all(
        files.map(
          (f) =>
            new Promise((resolve, reject) => {
              const s = cloudinary.uploader.upload_stream({ folder }, (e, r) =>
                e ? reject(e) : resolve(r)
              );
              streamifier.createReadStream(f.buffer).pipe(s);
            })
        )
      );
      req.cloudinaryUploads = uploads;
      next();
    } catch (e) {
      next(e);
    }
  };
}

export const uploadProductos = [
  uploadMemory.array("fotos", 10),
  uploader("productos"),
];

export const uploadServicios = [
  uploadMemory.single("imagen"),
  uploader("servicios"),
];

export const uploadGastos = [
  uploadMemory.single("comprobante"),
  uploader("gastos"),
];

export const uploadContratos = [
  uploadMemory.single("comprobante"),
  uploader("contratos"),
];
