const express = require('express');
const router = express.Router();

const multer = require('multer');
const cloudinary = require('../config/cloudinary');

const db = require('../db');


// =====================================================
// MULTER
// Nhận ảnh từ thiết bị
// =====================================================

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024 // tối đa 5MB
  },

  fileFilter: (req, file, cb) => {

    if (!file.mimetype.startsWith('image/')) {
      return cb(
        new Error('Chỉ được upload file hình ảnh!')
      );
    }

    cb(null, true);
  }
});


// =====================================================
// HELPER - UPLOAD ẢNH CLOUDINARY
// =====================================================

const uploadToCloudinary = (file) => {

  return new Promise((resolve, reject) => {

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'chipchiphouse/albums',
        resource_type: 'image'
      },

      (error, result) => {

        if (error) {
          reject(error);
        } else {
          resolve(result);
        }

      }
    );

    stream.end(file.buffer);

  });

};


// =====================================================
// HELPER - XÓA ẢNH CLOUDINARY
// =====================================================

const deleteFromCloudinary = async (imageUrl) => {

  if (!imageUrl) {
    return;
  }

  try {

    // Lấy public_id từ URL Cloudinary
    const uploadIndex = imageUrl.indexOf('/upload/');

    if (uploadIndex === -1) {
      return;
    }

    let publicId = imageUrl.substring(
      uploadIndex + '/upload/'.length
    );

    // Bỏ version v123456...
    publicId = publicId.replace(
      /^v\d+\//,
      ''
    );

    // Bỏ phần extension
    publicId = publicId.replace(
      /\.[^/.]+$/,
      ''
    );

    await cloudinary.uploader.destroy(
      publicId,
      {
        resource_type: 'image'
      }
    );

  } catch (error) {

    console.error(
      'Lỗi xóa ảnh Cloudinary:',
      error
    );

    // Không làm fail request chính
  }

};


// =====================================================
// GET - LẤY TẤT CẢ ALBUM
// GET /api/albums
// =====================================================

router.get('/', async (req, res) => {

  try {

    const [rows] = await db.query(`
      SELECT

        a.id,
        a.group_id,
        a.name,
        a.release_date,
        a.description,
        a.image_url,
        a.created_at,

        g.name AS group_name,

        COUNT(p.id) AS version_count,

        COALESCE(
          SUM(p.stock),
          0
        ) AS total_stock,

        MIN(p.price) AS min_price,

        MAX(p.price) AS max_price

      FROM albums a

      LEFT JOIN kpop_groups g
        ON a.group_id = g.id

      LEFT JOIN products p
        ON a.id = p.album_id

      GROUP BY

        a.id,
        a.group_id,
        a.name,
        a.release_date,
        a.description,
        a.image_url,
        a.created_at,
        g.name

      ORDER BY a.id DESC
    `);

    res.json({
      success: true,
      albums: rows
    });

  } catch (error) {

    console.error(
      'Lỗi lấy danh sách album:',
      error
    );

    res.status(500).json({
      success: false,
      message: 'Không thể lấy danh sách album!'
    });

  }

});


// =====================================================
// GET - LẤY ALBUM THEO NHÓM
// GET /api/albums/group/:groupId
// =====================================================

router.get('/group/:groupId', async (req, res) => {

  try {

    const { groupId } = req.params;

    if (!groupId || isNaN(groupId)) {

      return res.status(400).json({
        success: false,
        message: 'ID nhóm nhạc không hợp lệ!'
      });

    }


    // Kiểm tra nhóm

    const [groups] = await db.query(`
      SELECT
        id,
        name

      FROM kpop_groups

      WHERE id = ?

      LIMIT 1
    `, [groupId]);


    if (groups.length === 0) {

      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhóm nhạc!'
      });

    }


    // Lấy album

    const [albums] = await db.query(`
      SELECT

        a.id,
        a.group_id,
        a.name,
        a.release_date,
        a.description,
        a.image_url,
        a.created_at,

        COUNT(p.id) AS version_count,

        COALESCE(
          SUM(p.stock),
          0
        ) AS total_stock,

        MIN(p.price) AS min_price,

        MAX(p.price) AS max_price

      FROM albums a

      LEFT JOIN products p
        ON a.id = p.album_id

      WHERE a.group_id = ?

      GROUP BY

        a.id,
        a.group_id,
        a.name,
        a.release_date,
        a.description,
        a.image_url,
        a.created_at

      ORDER BY a.id DESC
    `, [groupId]);


    res.json({
      success: true,
      group: groups[0],
      albums
    });

  } catch (error) {

    console.error(
      'Lỗi lấy album của nhóm:',
      error
    );

    res.status(500).json({
      success: false,
      message: 'Không thể lấy album của nhóm!'
    });

  }

});


// =====================================================
// GET - CHI TIẾT ALBUM
// GET /api/albums/:id
// =====================================================

router.get('/:id', async (req, res) => {

  try {

    const { id } = req.params;

    if (!id || isNaN(id)) {

      return res.status(400).json({
        success: false,
        message: 'ID album không hợp lệ!'
      });

    }


    // =================================================
    // LẤY ALBUM
    // =================================================

    const [albums] = await db.query(`
      SELECT

        a.id,
        a.group_id,
        a.name,
        a.release_date,
        a.description,
        a.image_url,
        a.created_at,

        g.name AS group_name

      FROM albums a

      LEFT JOIN kpop_groups g
        ON a.group_id = g.id

      WHERE a.id = ?

      LIMIT 1
    `, [id]);


    if (albums.length === 0) {

      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy album!'
      });

    }


    // =================================================
    // LẤY CÁC VERSION
    // =================================================

    const [products] = await db.query(`
      SELECT

        id,
        album_id,
        title,
        version_name,
        price,
        stock,
        image_url,
        category,
        is_preorder,
        release_date,
        description,
        created_at

      FROM products

      WHERE album_id = ?

      ORDER BY id ASC
    `, [id]);


    res.json({
      success: true,
      album: albums[0],
      products
    });

  } catch (error) {

    console.error(
      'Lỗi lấy chi tiết album:',
      error
    );

    res.status(500).json({
      success: false,
      message: 'Không thể lấy thông tin album!'
    });

  }

});


// =====================================================
// POST - THÊM ALBUM
// POST /api/albums
//
// multipart/form-data
//
// Fields:
// group_id
// name
// release_date
// description
// image
// =====================================================

router.post(
  '/',
  upload.single('image'),
  async (req, res) => {

    try {

      const {
        group_id,
        name,
        release_date,
        description
      } = req.body;


      // =================================================
      // VALIDATE
      // =================================================

      if (!group_id || isNaN(group_id)) {

        return res.status(400).json({
          success: false,
          message: 'Vui lòng chọn nhóm nhạc!'
        });

      }


      if (!name || !name.trim()) {

        return res.status(400).json({
          success: false,
          message: 'Tên album không được để trống!'
        });

      }


      const albumName = name.trim();


      // =================================================
      // KIỂM TRA GROUP
      // =================================================

      const [groups] = await db.query(`
        SELECT
          id

        FROM kpop_groups

        WHERE id = ?

        LIMIT 1
      `, [group_id]);


      if (groups.length === 0) {

        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy nhóm nhạc!'
        });

      }


      // =================================================
      // KIỂM TRA TRÙNG ALBUM
      // =================================================

      const [existing] = await db.query(`
        SELECT
          id

        FROM albums

        WHERE group_id = ?

        AND LOWER(name) = LOWER(?)

        LIMIT 1
      `, [
        group_id,
        albumName
      ]);


      if (existing.length > 0) {

        return res.status(400).json({
          success: false,
          message: 'Album này đã tồn tại trong nhóm!'
        });

      }


      // =================================================
      // UPLOAD ẢNH
      // =================================================

      let imageUrl = null;

      if (req.file) {

        const result =
          await uploadToCloudinary(req.file);

        imageUrl = result.secure_url;

      }


      // =================================================
      // INSERT ALBUM
      // =================================================

      const [result] = await db.query(`
        INSERT INTO albums (

          group_id,
          name,
          release_date,
          description,
          image_url

        )

        VALUES (?, ?, ?, ?, ?)
      `, [

        group_id,
        albumName,
        release_date || null,
        description || null,
        imageUrl

      ]);


      // =================================================
      // LẤY ALBUM VỪA TẠO
      // =================================================

      const [rows] = await db.query(`
        SELECT

          id,
          group_id,
          name,
          release_date,
          description,
          image_url,
          created_at

        FROM albums

        WHERE id = ?
      `, [result.insertId]);


      res.status(201).json({

        success: true,

        message: 'Thêm album thành công!',

        album: rows[0]

      });

    } catch (error) {

      console.error(
        'Lỗi thêm album:',
        error
      );

      res.status(500).json({

        success: false,

        message:
          error.message ||
          'Không thể thêm album!'

      });

    }

  }
);


// =====================================================
// PUT - CẬP NHẬT ALBUM
// PUT /api/albums/:id
//
// multipart/form-data
//
// Fields:
// group_id
// name
// release_date
// description
// image
// =====================================================

router.put(
  '/:id',
  upload.single('image'),
  async (req, res) => {

    try {

      const { id } = req.params;

      const {
        group_id,
        name,
        release_date,
        description
      } = req.body;


      // =================================================
      // VALIDATE
      // =================================================

      if (!id || isNaN(id)) {

        return res.status(400).json({
          success: false,
          message: 'ID album không hợp lệ!'
        });

      }


      if (!group_id || isNaN(group_id)) {

        return res.status(400).json({
          success: false,
          message: 'Vui lòng chọn nhóm nhạc!'
        });

      }


      if (!name || !name.trim()) {

        return res.status(400).json({
          success: false,
          message: 'Tên album không được để trống!'
        });

      }


      const albumName = name.trim();


      // =================================================
      // LẤY ALBUM CŨ
      // =================================================

      const [existingAlbum] = await db.query(`
        SELECT

          id,
          image_url

        FROM albums

        WHERE id = ?

        LIMIT 1
      `, [id]);


      if (existingAlbum.length === 0) {

        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy album!'
        });

      }


      const oldAlbum = existingAlbum[0];


      // =================================================
      // KIỂM TRA GROUP
      // =================================================

      const [groups] = await db.query(`
        SELECT
          id

        FROM kpop_groups

        WHERE id = ?

        LIMIT 1
      `, [group_id]);


      if (groups.length === 0) {

        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy nhóm nhạc!'
        });

      }


      // =================================================
      // KIỂM TRA TRÙNG TÊN
      // =================================================

      const [duplicate] = await db.query(`
        SELECT
          id

        FROM albums

        WHERE group_id = ?

        AND LOWER(name) = LOWER(?)

        AND id <> ?

        LIMIT 1
      `, [

        group_id,
        albumName,
        id

      ]);


      if (duplicate.length > 0) {

        return res.status(400).json({
          success: false,
          message: 'Album này đã tồn tại trong nhóm!'
        });

      }


      // =================================================
      // XỬ LÝ ẢNH
      // =================================================

      let imageUrl = oldAlbum.image_url;


      if (req.file) {

        const result =
          await uploadToCloudinary(req.file);

        imageUrl = result.secure_url;

      }


      // =================================================
      // UPDATE
      // =================================================

      await db.query(`
        UPDATE albums

        SET

          group_id = ?,
          name = ?,
          release_date = ?,
          description = ?,
          image_url = ?

        WHERE id = ?
      `, [

        group_id,
        albumName,
        release_date || null,
        description || null,
        imageUrl,
        id

      ]);


      // =================================================
      // XÓA ẢNH CŨ SAU KHI UPDATE THÀNH CÔNG
      // =================================================

      if (
        req.file &&
        oldAlbum.image_url &&
        oldAlbum.image_url !== imageUrl
      ) {

        await deleteFromCloudinary(
          oldAlbum.image_url
        );

      }


      // =================================================
      // LẤY DỮ LIỆU MỚI
      // =================================================

      const [rows] = await db.query(`
        SELECT

          id,
          group_id,
          name,
          release_date,
          description,
          image_url,
          created_at

        FROM albums

        WHERE id = ?
      `, [id]);


      res.json({

        success: true,

        message: 'Cập nhật album thành công!',

        album: rows[0]

      });

    } catch (error) {

      console.error(
        'Lỗi cập nhật album:',
        error
      );

      res.status(500).json({

        success: false,

        message:
          error.message ||
          'Không thể cập nhật album!'

      });

    }

  }
);


// =====================================================
// DELETE - XÓA ALBUM
// DELETE /api/albums/:id
// =====================================================

router.delete('/:id', async (req, res) => {

  try {

    const { id } = req.params;


    if (!id || isNaN(id)) {

      return res.status(400).json({
        success: false,
        message: 'ID album không hợp lệ!'
      });

    }


    // =================================================
    // LẤY ALBUM
    // =================================================

    const [existing] = await db.query(`
      SELECT

        id,
        image_url

      FROM albums

      WHERE id = ?

      LIMIT 1
    `, [id]);


    if (existing.length === 0) {

      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy album!'
      });

    }


    const album = existing[0];


    // =================================================
    // KIỂM TRA PRODUCT
    // =================================================

    const [products] = await db.query(`
      SELECT
        id

      FROM products

      WHERE album_id = ?

      LIMIT 1
    `, [id]);


    if (products.length > 0) {

      return res.status(400).json({

        success: false,

        message:
          'Không thể xóa album vì album đang có version sản phẩm!'

      });

    }


    // =================================================
    // DELETE ALBUM
    // =================================================

    await db.query(`
      DELETE FROM albums

      WHERE id = ?
    `, [id]);


    // =================================================
    // XÓA ẢNH CLOUDINARY
    // =================================================

    if (album.image_url) {

      await deleteFromCloudinary(
        album.image_url
      );

    }


    res.json({

      success: true,

      message: 'Xóa album thành công!'

    });

  } catch (error) {

    console.error(
      'Lỗi xóa album:',
      error
    );

    res.status(500).json({

      success: false,

      message:
        error.message ||
        'Không thể xóa album!'

    });

  }

});


// =====================================================
// MULTER ERROR HANDLER
// =====================================================

router.use((error, req, res, next) => {

  if (error instanceof multer.MulterError) {

    if (error.code === 'LIMIT_FILE_SIZE') {

      return res.status(400).json({
        success: false,
        message: 'Ảnh không được vượt quá 5MB!'
      });

    }

    return res.status(400).json({
      success: false,
      message: error.message
    });

  }


  if (error) {

    return res.status(400).json({
      success: false,
      message: error.message
    });

  }


  next();

});


module.exports = router;