import { z } from "zod";
import { pool } from "../db/mysql.js";

const crearSchema = z.object({
  nombre: z.string().min(3).max(150),
  descripcion: z.string().optional(),
  duracion_minutos: z.number().int().positive(),
  precio: z.number().nonnegative(),
  comision_pct: z.number().min(0).max(100).optional(),
  esta_activo: z.boolean().optional(),
  esta_publicado: z.boolean().optional(),
});

const actualizarSchema = z.object({
  nombre: z.string().min(3).max(150).optional(),
  descripcion: z.string().optional(),
  duracion_minutos: z.number().int().positive().optional(),
  precio: z.number().nonnegative().optional(),
  comision_pct: z.number().min(0).max(100).optional(),
  esta_activo: z.boolean().optional(),
  esta_publicado: z.boolean().optional(),
});

export async function crearServicio(req, res) {
  const p = crearSchema.safeParse(req.body || {});
  if (!p.success) return res.status(422).json({ mensaje: "Datos inválidos" });
  const d = p.data;

  try {
    const [ex] = await pool.execute(
      "SELECT id FROM servicios WHERE nombre=? LIMIT 1",
      [d.nombre]
    );
    if (ex.length) return res.status(409).json({ mensaje: "Nombre duplicado" });

    const [r] = await pool.execute(
      `INSERT INTO servicios
      (nombre,descripcion,duracion_minutos,precio,comision_pct,esta_activo,esta_publicado,creado_por,actualizado_por,foto_principal)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        d.nombre,
        d.descripcion ?? null,
        d.duracion_minutos,
        d.precio,
        typeof d.comision_pct === "number" ? d.comision_pct : null,
        typeof d.esta_activo === "boolean" ? (d.esta_activo ? 1 : 0) : 1,
        typeof d.esta_publicado === "boolean" ? (d.esta_publicado ? 1 : 0) : 1,
        req.usuario?.sub || null,
        req.usuario?.sub || null,
        null,
      ]
    );

    const [row] = await pool.execute("SELECT * FROM servicios WHERE id=?", [
      r.insertId,
    ]);

    res.status(201).json({ data: row[0] });
  } catch (e) {
    res.status(400).json({ mensaje: e.message || "Error" });
  }
}

export async function listarServicios(req, res) {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const perPage = Math.min(
    Math.max(parseInt(req.query.per_page || "10", 10), 1),
    100
  );
  const q = req.query.q ? `%${req.query.q}%` : null;
  const estado = req.query.estado;
  const publicado = req.query.publicado;

  const cond = [];
  const vals = [];

  if (q) {
    cond.push("(nombre LIKE ? OR descripcion LIKE ?)");
    vals.push(q, q);
  }
  if (estado === "activo") cond.push("esta_activo=1");
  if (estado === "inactivo") cond.push("esta_activo=0");
  if (publicado === "publicado") cond.push("esta_publicado=1");
  if (publicado === "no_publicado") cond.push("esta_publicado=0");

  const where = cond.length ? ` WHERE ${cond.join(" AND ")}` : "";

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) total FROM servicios${where}`,
    vals
  );

  const offset = (page - 1) * perPage;

  const [rows] = await pool.query(
    `SELECT id,nombre,descripcion,duracion_minutos,precio,comision_pct,esta_activo,esta_publicado,creado_en,actualizado_en,foto_principal
     FROM servicios${where}
     ORDER BY creado_en DESC
     LIMIT ? OFFSET ?`,
    [...vals, perPage, offset]
  );

  res.json({
    data: rows,
    meta: {
      total,
      page,
      per_page: perPage,
      pages: Math.ceil(total / perPage),
    },
  });
}

export async function detalleServicio(req, res) {
  const id = Number(req.params.id);
  if (!id) return res.status(404).json({ mensaje: "No encontrado" });

  const [r] = await pool.execute("SELECT * FROM servicios WHERE id=?", [id]);

  if (!r.length) return res.status(404).json({ mensaje: "No encontrado" });
  res.json({ data: r[0] });
}

export async function actualizarServicio(req, res) {
  const id = Number(req.params.id);
  if (!id) return res.status(404).json({ mensaje: "No encontrado" });

  const p = actualizarSchema.safeParse(req.body || {});
  if (!p.success) return res.status(422).json({ mensaje: "Datos inválidos" });
  const d = p.data;

  try {
    if (d.nombre) {
      const [ex] = await pool.execute(
        "SELECT id FROM servicios WHERE nombre=? AND id<>?",
        [d.nombre, id]
      );
      if (ex.length)
        return res.status(409).json({ mensaje: "Nombre duplicado" });
    }

    await pool.execute(
      `UPDATE servicios SET
        nombre=COALESCE(?,nombre),
        descripcion=COALESCE(?,descripcion),
        duracion_minutos=COALESCE(?,duracion_minutos),
        precio=COALESCE(?,precio),
        comision_pct=COALESCE(?,comision_pct),
        esta_activo=COALESCE(?,esta_activo),
        esta_publicado=COALESCE(?,esta_publicado),
        actualizado_por=?,
        actualizado_en=NOW()
      WHERE id=?`,
      [
        d.nombre ?? null,
        d.descripcion ?? null,
        d.duracion_minutos ?? null,
        d.precio ?? null,
        typeof d.comision_pct === "number" ? d.comision_pct : null,
        typeof d.esta_activo === "boolean" ? (d.esta_activo ? 1 : 0) : null,
        typeof d.esta_publicado === "boolean"
          ? d.esta_publicado
            ? 1
            : 0
          : null,
        req.usuario?.sub || null,
        id,
      ]
    );

    const [row] = await pool.execute("SELECT * FROM servicios WHERE id=?", [
      id,
    ]);

    res.json({ data: row[0] });
  } catch (e) {
    res.status(400).json({ mensaje: e.message || "Error" });
  }
}

export async function eliminarServicio(req, res) {
  const id = Number(req.params.id);
  if (!id) return res.status(404).json({ mensaje: "No encontrado" });

  await pool.execute(
    "UPDATE servicios SET esta_activo=0, actualizado_en=NOW() WHERE id=?",
    [id]
  );

  res.json({ mensaje: "Inhabilitado" });
}

export async function listarServiciosPublico(req, res) {
  try {
    const { activo = 1, publicado = 1 } = req.query;

    let query = `
      SELECT id,nombre,descripcion,duracion_minutos,precio + 0 AS precio,foto_principal
      FROM servicios WHERE 1=1
    `;
    const params = [];

    if (activo !== undefined && activo !== "") {
      query += " AND esta_activo=?";
      params.push(activo === "1" || activo === 1 ? 1 : 0);
    }
    if (publicado !== undefined && publicado !== "") {
      query += " AND esta_publicado=?";
      params.push(publicado === "1" || publicado === 1 ? 1 : 0);
    }

    query += " ORDER BY nombre ASC";

    const [rows] =
      params.length > 0
        ? await pool.execute(query, params)
        : await pool.query(query);

    const normalized = rows.map((r) => ({
      ...r,
      precio: r.precio == null ? null : Number(r.precio),
    }));

    res.json({ data: normalized });
  } catch {
    res.status(500).json({ mensaje: "Error al listar servicios" });
  }
}

export async function obtenerServicioPublico(req, res) {
  const id = Number(req.params.id);

  const [[row]] = await pool.query(
    `SELECT id,nombre,descripcion,duracion_minutos,precio + 0 AS precio,foto_principal
     FROM servicios WHERE id=? AND esta_publicado=1`,
    [id]
  );

  if (!row) return res.status(404).json({ mensaje: "Servicio no encontrado" });

  row.precio = row.precio == null ? null : Number(row.precio);
  res.json({ data: row });
}

export async function agregarImagenServicio(req, res) {
  const id = Number(req.params.id);
  if (!req.cloudinaryUploads?.length)
    return res.status(422).json({ mensaje: "Sin archivo" });

  const url = req.cloudinaryUploads[0].secure_url;

  await pool.execute(
    "UPDATE servicios SET foto_principal=?, actualizado_en=NOW() WHERE id=?",
    [url, id]
  );

  res.status(201).json({ url });
}

export async function eliminarImagenServicio(req, res) {
  const id = Number(req.params.id);

  await pool.execute(
    "UPDATE servicios SET foto_principal=NULL, actualizado_en=NOW() WHERE id=?",
    [id]
  );

  res.json({ mensaje: "Eliminado" });
}
