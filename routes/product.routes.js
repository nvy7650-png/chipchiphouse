const express = require('express');
const router = express.Router();

const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const db = require('../db');


// =====================================================
// CLOUDINARY
// =====================================================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});


// =====================================================
// MULTER
// Lưu file trong memory để upload trực tiếp Cloudinary
// =====================================================

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {

    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp'
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error(
          'Chỉ được upload ảnh JPG, JPEG, PNG hoặc WEBP!'
        )
      );
    }

    cb(null, true);
  }
});


// =====================================================
// HÀM UPLOAD CLOUDINARY
// =====================================================

const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'chipchip/products',

        resource_type: 'image',

        transformation: [
          {
            width: 1000,
            height: 1000,
            crop: 'limit',
            quality: 'auto',
            fetch_format: 'auto'
          }
        ]
      },

      (error, result) => {

        if (error) {
          return reject(error);
        }

        resolve(result);
      }
    );

    stream.end(buffer);
  });
};


// =====================================================
// HÀM XÓA ẢNH CLOUDINARY
// =====================================================

const deleteFromCloudinary = async (publicId) => {

  if (!publicId) return;

  try {

    await cloudinary.uploader.destroy(publicId);

  } catch (error) {

    console.error(
      'Lỗi xóa ảnh Cloudinary:',
      error
    );

  }
};


// =====================================================
// GET - LẤY TẤT CẢ SẢN PHẨM
//
// GET /api/products
// =====================================================

router.get('/', async (req, res) => {

  try {

    const [rows] = await db.query(`

      SELECT

        p.id,
        p.album_id,
        p.title,
        p.version_name,
        p.price,
        p.stock,
        p.image_url,
        p.category,
        p.is_preorder,
        p.release_date,
        p.description,
        p.created_at,

        a.name AS album_name,

        g.id AS group_id,
        g.name AS group_name,

        COALESCE(
          SUM(
            d.quantity * d.import_price
          ) / NULLIF(SUM(d.quantity), 0),
          0
        ) AS average_import_price,

        (
          p.price -

          COALESCE(
            SUM(
              d.quantity * d.import_price
            ) / NULLIF(SUM(d.quantity), 0),
            0
          )

        ) AS estimated_profit

      FROM products p

      LEFT JOIN albums a
        ON p.album_id = a.id

      LEFT JOIN kpop_groups g
        ON a.group_id = g.id

      LEFT JOIN import_details d
        ON d.product_id = p.id

      GROUP BY

        p.id,
        p.album_id,
        p.title,
        p.version_name,
        p.price,
        p.stock,
        p.image_url,
        p.category,
        p.is_preorder,
        p.release_date,
        p.description,
        p.created_at,

        a.name,
        g.id,
        g.name

      ORDER BY p.id DESC

    `);

    res.json({
      success: true,
      products: rows
    });

  } catch (error) {

    console.error(
      'Lỗi lấy danh sách sản phẩm:',
      error
    );

    res.status(500).json({
      success: false,
      message:
        'Không thể lấy danh sách sản phẩm!'
    });

  }

});


// =====================================================
// GET - LẤY ALBUM ĐỂ CHỌN
//
// GET /api/products/albums
//
// Dùng cho dropdown khi thêm sản phẩm
// =====================================================

router.get('/albums', async (req, res) => {

  try {

    const [rows] = await db.query(`

      SELECT

        a.id,
        a.name,
        a.group_id,

        g.name AS group_name

      FROM albums a

      LEFT JOIN kpop_groups g
        ON a.group_id = g.id

      ORDER BY
        g.name ASC,
        a.name ASC

    `);

    res.json({
      success: true,
      albums: rows
    });

  } catch (error) {

    console.error(
      'Lỗi lấy album:',
      error
    );

    res.status(500).json({
      success: false,
      message:
        'Không thể lấy danh sách album!'
    });

  }

});


// =====================================================
// GET - CHI TIẾT SẢN PHẨM
//
// GET /api/products/:id
// =====================================================

router.get('/:id', async (req, res) => {

  try {

    const { id } = req.params;

    if (!id || isNaN(id)) {

      return res.status(400).json({
        success: false,
        message:
          'ID sản phẩm không hợp lệ!'
      });

    }


    const [products] = await db.query(`

      SELECT

        p.id,
        p.album_id,
        p.title,
        p.version_name,
        p.price,
        p.stock,
        p.image_url,
        p.category,
        p.is_preorder,
        p.release_date,
        p.description,
        p.created_at,

        a.name AS album_name,

        g.id AS group_id,
        g.name AS group_name

      FROM products p

      LEFT JOIN albums a
        ON p.album_id = a.id

      LEFT JOIN kpop_groups g
        ON a.group_id = g.id

      WHERE p.id = ?

      LIMIT 1

    `, [id]);


    if (products.length === 0) {

      return res.status(404).json({
        success: false,
        message:
          'Không tìm thấy sản phẩm!'
      });

    }


    // =================================================
    // TÍNH GIÁ NHẬP BÌNH QUÂN
    // =================================================

    const [costRows] = await db.query(`

      SELECT

        COALESCE(
          SUM(quantity * import_price)
          / NULLIF(SUM(quantity), 0),
          0
        ) AS average_import_price,

        COALESCE(
          SUM(quantity),
          0
        ) AS total_import_quantity,

        COALESCE(
          SUM(quantity * import_price),
          0
        ) AS total_import_cost

      FROM import_details

      WHERE product_id = ?

    `, [id]);


    const product = products[0];

    const averageImportPrice =
      Number(
        costRows[0]?.average_import_price || 0
      );

    const estimatedProfit =
      Number(product.price) -
      averageImportPrice;


    res.json({

      success: true,

      product: {
        ...product,

        average_import_price:
          averageImportPrice,

        estimated_profit:
          estimatedProfit,

        total_import_quantity:
          Number(
            costRows[0]?.total_import_quantity || 0
          ),

        total_import_cost:
          Number(
            costRows[0]?.total_import_cost || 0
          )
      }

    });

  } catch (error) {

    console.error(
      'Lỗi lấy chi tiết sản phẩm:',
      error
    );

    res.status(500).json({
      success: false,
      message:
        'Không thể lấy thông tin sản phẩm!'
    });

  }

});


// =====================================================
// POST - THÊM SẢN PHẨM
//
// POST /api/products
//
// multipart/form-data
// =====================================================

router.post(
  '/',
  upload.single('image'),

  async (req, res) => {

    try {

      const {
        album_id,
        title,
        version_name,
        price,
        category,
        is_preorder,
        release_date,
        description
      } = req.body;


      // =================================================
      // VALIDATE ALBUM
      // =================================================

      if (!album_id || isNaN(album_id)) {

        return res.status(400).json({
          success: false,
          message:
            'Vui lòng chọn album!'
        });

      }


      // =================================================
      // VALIDATE TITLE
      // =================================================

      if (!title || !title.trim()) {

        return res.status(400).json({
          success: false,
          message:
            'Tên sản phẩm không được để trống!'
        });

      }


      // =================================================
      // VALIDATE VERSION
      // =================================================

      if (
        !version_name ||
        !version_name.trim()
      ) {

        return res.status(400).json({
          success: false,
          message:
            'Tên version không được để trống!'
        });

      }


      // =================================================
      // VALIDATE PRICE
      // =================================================

      const productPrice =
        Number(price);

      if (
        isNaN(productPrice) ||
        productPrice < 0
      ) {

        return res.status(400).json({
          success: false,
          message:
            'Giá bán không hợp lệ!'
        });

      }


      // =================================================
      // KIỂM TRA ALBUM
      // =================================================

      const [albums] = await db.query(`

        SELECT
          id
        FROM albums
        WHERE id = ?
        LIMIT 1

      `, [album_id]);


      if (albums.length === 0) {

        return res.status(404).json({
          success: false,
          message:
            'Không tìm thấy album!'
        });

      }


      // =================================================
      // KIỂM TRA VERSION TRÙNG
      // =================================================

      const [existing] = await db.query(`

        SELECT
          id
        FROM products

        WHERE album_id = ?

          AND LOWER(version_name)
              = LOWER(?)

        LIMIT 1

      `, [
        album_id,
        version_name.trim()
      ]);


      if (existing.length > 0) {

        return res.status(400).json({
          success: false,
          message:
            'Version này đã tồn tại trong album!'
        });

      }


      // =================================================
      // UPLOAD ẢNH
      // =================================================

      let imageUrl = null;
      let imagePublicId = null;

      if (req.file) {

        const uploaded =
          await uploadToCloudinary(
            req.file.buffer
          );

        imageUrl =
          uploaded.secure_url;

        imagePublicId =
          uploaded.public_id;

      }


      // =================================================
      // INSERT
      // =================================================

      const [result] = await db.query(`

        INSERT INTO products (

          album_id,
          title,
          version_name,
          price,
          stock,
          image_url,
          category,
          is_preorder,
          release_date,
          description

        )

        VALUES (
          ?, ?, ?, ?, 0, ?, ?, ?, ?, ?
        )

      `, [

        album_id,

        title.trim(),

        version_name.trim(),

        productPrice,

        imageUrl,

        category || 'album',

        is_preorder === 'true'
          || is_preorder === '1'
          ? 1
          : 0,

        release_date || null,

        description
          ? description.trim()
          : null

      ]);


      // =================================================
      // LẤY LẠI
      // =================================================

      const [rows] = await db.query(`

        SELECT

          p.*,

          a.name AS album_name,

          g.name AS group_name

        FROM products p

        LEFT JOIN albums a
          ON p.album_id = a.id

        LEFT JOIN kpop_groups g
          ON a.group_id = g.id

        WHERE p.id = ?

      `, [result.insertId]);


      res.status(201).json({

        success: true,

        message:
          'Thêm sản phẩm thành công!',

        product: rows[0]

      });

    } catch (error) {

      console.error(
        'Lỗi thêm sản phẩm:',
        error
      );

      res.status(500).json({
        success: false,
        message:
          error.message ||
          'Không thể thêm sản phẩm!'
      });

    }

  }
);


// =====================================================
// PUT - CẬP NHẬT SẢN PHẨM
//
// PUT /api/products/:id
// =====================================================

router.put(
  '/:id',
  upload.single('image'),

  async (req, res) => {

    try {

      const { id } = req.params;

      if (!id || isNaN(id)) {

        return res.status(400).json({
          success: false,
          message:
            'ID sản phẩm không hợp lệ!'
        });

      }


      const {
        album_id,
        title,
        version_name,
        price,
        category,
        is_preorder,
        release_date,
        description
      } = req.body;


      if (!album_id || isNaN(album_id)) {

        return res.status(400).json({
          success: false,
          message:
            'Vui lòng chọn album!'
        });

      }


      if (!title || !title.trim()) {

        return res.status(400).json({
          success: false,
          message:
            'Tên sản phẩm không được để trống!'
        });

      }


      if (
        !version_name ||
        !version_name.trim()
      ) {

        return res.status(400).json({
          success: false,
          message:
            'Tên version không được để trống!'
        });

      }


      const productPrice =
        Number(price);

      if (
        isNaN(productPrice) ||
        productPrice < 0
      ) {

        return res.status(400).json({
          success: false,
          message:
            'Giá bán không hợp lệ!'
        });

      }


      // =================================================
      // KIỂM TRA PRODUCT
      // =================================================

      const [products] = await db.query(`

        SELECT
          id,
          image_url

        FROM products

        WHERE id = ?

        LIMIT 1

      `, [id]);


      if (products.length === 0) {

        return res.status(404).json({
          success: false,
          message:
            'Không tìm thấy sản phẩm!'
        });

      }


      // =================================================
      // KIỂM TRA ALBUM
      // =================================================

      const [albums] = await db.query(`

        SELECT id
        FROM albums
        WHERE id = ?
        LIMIT 1

      `, [album_id]);


      if (albums.length === 0) {

        return res.status(404).json({
          success: false,
          message:
            'Không tìm thấy album!'
        });

      }


      // =================================================
      // KIỂM TRA TRÙNG VERSION
      // =================================================

      const [duplicate] = await db.query(`

        SELECT
          id

        FROM products

        WHERE album_id = ?

          AND LOWER(version_name)
              = LOWER(?)

          AND id <> ?

        LIMIT 1

      `, [
        album_id,
        version_name.trim(),
        id
      ]);


      if (duplicate.length > 0) {

        return res.status(400).json({
          success: false,
          message:
            'Version này đã tồn tại trong album!'
        });

      }


      // =================================================
      // ẢNH
      // =================================================

      let imageUrl =
        products[0].image_url;


      if (req.file) {

        const uploaded =
          await uploadToCloudinary(
            req.file.buffer
          );

        imageUrl =
          uploaded.secure_url;

      }


      // =================================================
      // UPDATE
      // =================================================

      await db.query(`

        UPDATE products

        SET

          album_id = ?,
          title = ?,
          version_name = ?,
          price = ?,
          image_url = ?,
          category = ?,
          is_preorder = ?,
          release_date = ?,
          description = ?

        WHERE id = ?

      `, [

        album_id,

        title.trim(),

        version_name.trim(),

        productPrice,

        imageUrl,

        category || 'album',

        is_preorder === 'true'
          || is_preorder === '1'
          ? 1
          : 0,

        release_date || null,

        description
          ? description.trim()
          : null,

        id

      ]);


      // =================================================
      // LẤY LẠI
      // =================================================

      const [rows] = await db.query(`

        SELECT

          p.*,

          a.name AS album_name,

          g.name AS group_name

        FROM products p

        LEFT JOIN albums a
          ON p.album_id = a.id

        LEFT JOIN kpop_groups g
          ON a.group_id = g.id

        WHERE p.id = ?

      `, [id]);


      res.json({

        success: true,

        message:
          'Cập nhật sản phẩm thành công!',

        product: rows[0]

      });

    } catch (error) {

      console.error(
        'Lỗi cập nhật sản phẩm:',
        error
      );

      res.status(500).json({
        success: false,
        message:
          error.message ||
          'Không thể cập nhật sản phẩm!'
      });

    }

  }
);


// =====================================================
// DELETE - XÓA SẢN PHẨM
//
// DELETE /api/products/:id
// =====================================================

router.delete('/:id', async (req, res) => {

  try {

    const { id } = req.params;

    if (!id || isNaN(id)) {

      return res.status(400).json({
        success: false,
        message:
          'ID sản phẩm không hợp lệ!'
      });

    }


    // =================================================
    // KIỂM TRA PRODUCT
    // =================================================

    const [products] = await db.query(`

      SELECT
        id,
        stock,
        image_url

      FROM products

      WHERE id = ?

      LIMIT 1

    `, [id]);


    if (products.length === 0) {

      return res.status(404).json({
        success: false,
        message:
          'Không tìm thấy sản phẩm!'
      });

    }


    // =================================================
    // KHÔNG CHO XÓA NẾU CÒN STOCK
    // =================================================

    if (
      Number(products[0].stock) > 0
    ) {

      return res.status(400).json({
        success: false,
        message:
          'Không thể xóa sản phẩm vì sản phẩm vẫn còn tồn kho!'
      });

    }


    // =================================================
    // KIỂM TRA ĐÃ TỪNG NHẬP HÀNG
    // =================================================

    const [imports] = await db.query(`

      SELECT
        id

      FROM import_details

      WHERE product_id = ?

      LIMIT 1

    `, [id]);


    if (imports.length > 0) {

      return res.status(400).json({
        success: false,
        message:
          'Không thể xóa sản phẩm vì sản phẩm đã có lịch sử nhập hàng!'
      });

    }


    // =================================================
    // XÓA DATABASE
    // =================================================

    await db.query(`

      DELETE FROM products

      WHERE id = ?

    `, [id]);


    res.json({

      success: true,

      message:
        'Xóa sản phẩm thành công!'

    });

  } catch (error) {

    console.error(
      'Lỗi xóa sản phẩm:',
      error
    );

    res.status(500).json({
      success: false,
      message:
        'Không thể xóa sản phẩm!'
    });

  }

});


// =====================================================
// MULTER / UPLOAD ERROR
// =====================================================

router.use((error, req, res, next) => {

  if (error instanceof multer.MulterError) {

    return res.status(400).json({
      success: false,
      message:
        'Ảnh không được vượt quá 5MB!'
    });

  }


  if (error) {

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        'Lỗi upload ảnh!'
    });

  }


  next();

});


module.exports = router;