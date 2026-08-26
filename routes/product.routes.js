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
// UPLOAD ẢNH CLOUDINARY
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
// XÓA ẢNH CLOUDINARY
// =====================================================

const deleteFromCloudinary = async (publicId) => {

  if (!publicId) {
    return;
  }

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
// CATEGORY HỢP LỆ
// =====================================================

const VALID_CATEGORIES = [
  'album',
  'photocard',
  'md_event',
  'lightstick'
];


// =====================================================
// HELPER
// =====================================================

const isValidId = (id) => {
  return id !== undefined &&
         id !== null &&
         id !== '' &&
         !isNaN(id) &&
         Number(id) > 0;
};


const getBooleanValue = (value) => {

  return (
    value === true ||
    value === 'true' ||
    value === '1' ||
    value === 1
  )
    ? 1
    : 0;
};


// =====================================================
// GET TẤT CẢ SẢN PHẨM
//
// GET /api/products
//
// Query:
// ?search=RIIZE
// ?category=album
// ?search=RIIZE&category=album
// =====================================================

router.get('/', async (req, res) => {

  try {

    const {
      search = '',
      category = ''
    } = req.query;


    let sql = `
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
          SUM(d.quantity * d.import_price)
          / NULLIF(SUM(d.quantity), 0),
          0
        ) AS average_import_price,

        (
          p.price -

          COALESCE(
            SUM(d.quantity * d.import_price)
            / NULLIF(SUM(d.quantity), 0),
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

      WHERE 1 = 1
    `;

    const params = [];


    // =================================================
    // CATEGORY
    // =================================================

    if (
      category &&
      VALID_CATEGORIES.includes(category)
    ) {

      sql += `
        AND p.category = ?
      `;

      params.push(category);
    }


    // =================================================
    // SEARCH
    //
    // Tìm theo:
    // - tên sản phẩm
    // - version
    // - album
    // - nhóm
    // =================================================

    if (search && search.trim()) {

      const keyword = `%${search.trim()}%`;

      sql += `
        AND (
          LOWER(p.title) LIKE LOWER(?)

          OR LOWER(
            COALESCE(p.version_name, '')
          ) LIKE LOWER(?)

          OR LOWER(
            COALESCE(a.name, '')
          ) LIKE LOWER(?)

          OR LOWER(
            COALESCE(g.name, '')
          ) LIKE LOWER(?)
        )
      `;

      params.push(
        keyword,
        keyword,
        keyword,
        keyword
      );
    }


    // =================================================
    // GROUP
    // =================================================

    sql += `

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
    `;


    const [rows] = await db.query(
      sql,
      params
    );


    // Convert số cho frontend
    const products = rows.map((product) => ({
      ...product,

      id: Number(product.id),

      album_id:
        product.album_id !== null
          ? Number(product.album_id)
          : null,

      price: Number(product.price || 0),

      stock: Number(product.stock || 0),

      average_import_price:
        Number(
          product.average_import_price || 0
        ),

      estimated_profit:
        Number(
          product.estimated_profit || 0
        ),

      is_preorder:
        Number(product.is_preorder || 0)
    }));


    res.json({
      success: true,
      products
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
// GET ALBUM
//
// QUAN TRỌNG:
// Route này phải nằm TRƯỚC /:id
//
// GET /api/products/albums
//
// Có tìm kiếm:
//
// /api/products/albums?search=RIIZE
// =====================================================

router.get('/albums', async (req, res) => {

  try {

    const {
      search = ''
    } = req.query;


    let sql = `

      SELECT

        a.id,
        a.name,
        a.group_id,

        g.name AS group_name

      FROM albums a

      LEFT JOIN kpop_groups g
        ON a.group_id = g.id

      WHERE 1 = 1

    `;

    const params = [];


    if (search && search.trim()) {

      const keyword =
        `%${search.trim()}%`;

      sql += `

        AND (

          LOWER(a.name)
            LIKE LOWER(?)

          OR LOWER(
            COALESCE(g.name, '')
          )
            LIKE LOWER(?)

        )

      `;

      params.push(
        keyword,
        keyword
      );
    }


    sql += `

      ORDER BY

        g.name ASC,

        a.name ASC

    `;


    const [rows] =
      await db.query(
        sql,
        params
      );


    const albums = rows.map((album) => ({
      ...album,

      id: Number(album.id),

      group_id:
        album.group_id !== null
          ? Number(album.group_id)
          : null
    }));


    res.json({
      success: true,
      albums
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
// GET CHI TIẾT SẢN PHẨM
//
// GET /api/products/:id
// =====================================================

router.get('/:id', async (req, res) => {

  try {

    const {
      id
    } = req.params;


    if (!isValidId(id)) {

      return res.status(400).json({
        success: false,
        message:
          'ID sản phẩm không hợp lệ!'
      });
    }


    const [products] =
      await db.query(`

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
    // GIÁ NHẬP
    // =================================================

    const [costRows] =
      await db.query(`

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


    const result = {

      ...product,

      id: Number(product.id),

      album_id:
        product.album_id !== null
          ? Number(product.album_id)
          : null,

      price:
        Number(product.price || 0),

      stock:
        Number(product.stock || 0),

      average_import_price:
        averageImportPrice,

      estimated_profit:
        Number(product.price || 0) -
        averageImportPrice,

      total_import_quantity:
        Number(
          costRows[0]?.total_import_quantity || 0
        ),

      total_import_cost:
        Number(
          costRows[0]?.total_import_cost || 0
        )
    };


    res.json({
      success: true,
      product: result
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
// POST THÊM SẢN PHẨM
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


      const productCategory =
        category || 'album';


      // =================================================
      // CATEGORY
      // =================================================

      if (
        !VALID_CATEGORIES.includes(
          productCategory
        )
      ) {

        return res.status(400).json({
          success: false,
          message:
            'Danh mục sản phẩm không hợp lệ!'
        });
      }


      // =================================================
      // TITLE
      // =================================================

      if (
        !title ||
        !title.trim()
      ) {

        return res.status(400).json({
          success: false,
          message:
            'Tên sản phẩm không được để trống!'
        });
      }


      // =================================================
      // PRICE
      // =================================================

      if (
        price === undefined ||
        price === null ||
        price === ''
      ) {

        return res.status(400).json({
          success: false,
          message:
            'Giá bán không được để trống!'
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
      // ALBUM PRODUCT
      //
      // category = album
      //
      // BẮT BUỘC:
      // - album_id
      // - version_name
      // =================================================

      let finalAlbumId = null;
      let finalVersionName = null;


      if (
        productCategory === 'album'
      ) {

        if (
          !isValidId(album_id)
        ) {

          return res.status(400).json({
            success: false,
            message:
              'Sản phẩm album phải thuộc một album!'
          });
        }


        if (
          !version_name ||
          !version_name.trim()
        ) {

          return res.status(400).json({
            success: false,
            message:
              'Sản phẩm album phải có tên version!'
          });
        }


        finalAlbumId =
          Number(album_id);


        finalVersionName =
          version_name.trim();


        // =================================================
        // KIỂM TRA ALBUM
        // =================================================

        const [albums] =
          await db.query(`

            SELECT id

            FROM albums

            WHERE id = ?

            LIMIT 1

          `, [
            finalAlbumId
          ]);


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

        const [duplicate] =
          await db.query(`

            SELECT id

            FROM products

            WHERE album_id = ?

              AND LOWER(
                COALESCE(version_name, '')
              )
              =
              LOWER(?)

            LIMIT 1

          `, [
            finalAlbumId,
            finalVersionName
          ]);


        if (duplicate.length > 0) {

          return res.status(400).json({
            success: false,
            message:
              'Version này đã tồn tại trong album!'
          });
        }
      }


      // =================================================
      // PHOTOCARD / MD EVENT / LIGHTSTICK
      //
      // KHÔNG CÓ VERSION
      //
      // KHÔNG BẮT BUỘC ALBUM
      // =================================================

      if (
        productCategory !== 'album'
      ) {

        finalAlbumId = null;

        finalVersionName = null;
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

      const [result] =
        await db.query(`

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

            ?,
            ?,
            ?,
            ?,
            0,
            ?,
            ?,
            ?,
            ?,
            ?

          )

        `, [

          finalAlbumId,

          title.trim(),

          finalVersionName,

          productPrice,

          imageUrl,

          productCategory,

          getBooleanValue(is_preorder),

          release_date || null,

          description
            ? description.trim()
            : null
        ]);


      // =================================================
      // LẤY SẢN PHẨM VỪA TẠO
      // =================================================

      const [rows] =
        await db.query(`

          SELECT

            p.*,

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

        `, [
          result.insertId
        ]);


      res.status(201).json({

        success: true,

        message:
          'Thêm sản phẩm thành công!',

        product: {

          ...rows[0],

          id:
            Number(rows[0].id),

          album_id:
            rows[0].album_id !== null
              ? Number(rows[0].album_id)
              : null,

          price:
            Number(rows[0].price || 0),

          stock:
            Number(rows[0].stock || 0)
        }

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
// PUT CẬP NHẬT SẢN PHẨM
//
// PUT /api/products/:id
//
// multipart/form-data
// =====================================================

router.put(
  '/:id',
  upload.single('image'),

  async (req, res) => {

    try {

      const {
        id
      } = req.params;


      if (!isValidId(id)) {

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


      const productCategory =
        category || 'album';


      // =================================================
      // CATEGORY
      // =================================================

      if (
        !VALID_CATEGORIES.includes(
          productCategory
        )
      ) {

        return res.status(400).json({
          success: false,
          message:
            'Danh mục sản phẩm không hợp lệ!'
        });
      }


      // =================================================
      // TITLE
      // =================================================

      if (
        !title ||
        !title.trim()
      ) {

        return res.status(400).json({
          success: false,
          message:
            'Tên sản phẩm không được để trống!'
        });
      }


      // =================================================
      // PRICE
      // =================================================

      if (
        price === undefined ||
        price === null ||
        price === ''
      ) {

        return res.status(400).json({
          success: false,
          message:
            'Giá bán không được để trống!'
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
      // LẤY PRODUCT CŨ
      // =================================================

      const [products] =
        await db.query(`

          SELECT

            id,
            album_id,
            version_name,
            image_url,
            category

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


      const oldProduct =
        products[0];


      // =================================================
      // XỬ LÝ ALBUM
      // =================================================

      let finalAlbumId = null;
      let finalVersionName = null;


      if (
        productCategory === 'album'
      ) {

        if (
          !isValidId(album_id)
        ) {

          return res.status(400).json({
            success: false,
            message:
              'Sản phẩm album phải thuộc một album!'
          });
        }


        if (
          !version_name ||
          !version_name.trim()
        ) {

          return res.status(400).json({
            success: false,
            message:
              'Sản phẩm album phải có tên version!'
          });
        }


        finalAlbumId =
          Number(album_id);


        finalVersionName =
          version_name.trim();


        // =================================================
        // KIỂM TRA ALBUM
        // =================================================

        const [albums] =
          await db.query(`

            SELECT id

            FROM albums

            WHERE id = ?

            LIMIT 1

          `, [
            finalAlbumId
          ]);


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

        const [duplicate] =
          await db.query(`

            SELECT id

            FROM products

            WHERE album_id = ?

              AND LOWER(
                COALESCE(version_name, '')
              )
              =
              LOWER(?)

              AND id <> ?

            LIMIT 1

          `, [
            finalAlbumId,
            finalVersionName,
            id
          ]);


        if (duplicate.length > 0) {

          return res.status(400).json({
            success: false,
            message:
              'Version này đã tồn tại trong album!'
          });
        }
      }


      // =================================================
      // PHOTOCARD / MD EVENT / LIGHTSTICK
      // =================================================

      if (
        productCategory !== 'album'
      ) {

        finalAlbumId = null;

        finalVersionName = null;
      }


      // =================================================
      // ẢNH
      // =================================================

      let imageUrl =
        oldProduct.image_url;


      let newPublicId = null;


      if (req.file) {

        const uploaded =
          await uploadToCloudinary(
            req.file.buffer
          );

        imageUrl =
          uploaded.secure_url;

        newPublicId =
          uploaded.public_id;
      }


      // =================================================
      // UPDATE
      //
      // KHÔNG UPDATE STOCK
      //
      // STOCK phải được quản lý thông qua
      // nhập hàng / xuất hàng.
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

        finalAlbumId,

        title.trim(),

        finalVersionName,

        productPrice,

        imageUrl,

        productCategory,

        getBooleanValue(is_preorder),

        release_date || null,

        description
          ? description.trim()
          : null,

        id

      ]);


      // =================================================
      // NẾU UPLOAD ẢNH MỚI
      // XÓA ẢNH CŨ
      //
      // Chỉ thực hiện nếu DB đã update thành công.
      // =================================================

      if (
        req.file &&
        oldProduct.image_url &&
        newPublicId
      ) {

        try {

          const oldUrl =
            oldProduct.image_url;

          const match =
            oldUrl.match(
              /\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/
            );

          if (match && match[1]) {

            await deleteFromCloudinary(
              match[1]
            );
          }

        } catch (error) {

          console.error(
            'Không thể xóa ảnh cũ:',
            error
          );
        }
      }


      // =================================================
      // LẤY LẠI PRODUCT
      // =================================================

      const [rows] =
        await db.query(`

          SELECT

            p.*,

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


      res.json({

        success: true,

        message:
          'Cập nhật sản phẩm thành công!',

        product: {

          ...rows[0],

          id:
            Number(rows[0].id),

          album_id:
            rows[0].album_id !== null
              ? Number(rows[0].album_id)
              : null,

          price:
            Number(rows[0].price || 0),

          stock:
            Number(rows[0].stock || 0)
        }

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
// DELETE XÓA SẢN PHẨM
//
// DELETE /api/products/:id
// =====================================================

router.delete('/:id', async (req, res) => {

  try {

    const {
      id
    } = req.params;


    if (!isValidId(id)) {

      return res.status(400).json({
        success: false,
        message:
          'ID sản phẩm không hợp lệ!'
      });
    }


    // =================================================
    // LẤY PRODUCT
    // =================================================

    const [products] =
      await db.query(`

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


    const product =
      products[0];


    // =================================================
    // KHÔNG CHO XÓA NẾU CÒN STOCK
    // =================================================

    if (
      Number(product.stock || 0) > 0
    ) {

      return res.status(400).json({
        success: false,
        message:
          'Không thể xóa sản phẩm vì sản phẩm vẫn còn tồn kho!'
      });
    }


    // =================================================
    // KIỂM TRA LỊCH SỬ NHẬP HÀNG
    // =================================================

    const [imports] =
      await db.query(`

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
    // XÓA PRODUCT
    // =================================================

    await db.query(`

      DELETE FROM products

      WHERE id = ?

    `, [id]);


    // =================================================
    // XÓA ẢNH CLOUDINARY
    //
    // Thử lấy public_id từ URL.
    // =================================================

    if (product.image_url) {

      try {

        const match =
          product.image_url.match(
            /\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/
          );

        if (match && match[1]) {

          await deleteFromCloudinary(
            match[1]
          );
        }

      } catch (error) {

        console.error(
          'Lỗi xóa ảnh Cloudinary:',
          error
        );
      }
    }


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

    // =================================================
    // FOREIGN KEY
    // =================================================

    if (
      error.code === 'ER_ROW_IS_REFERENCED_2' ||
      error.code === 'ER_ROW_IS_REFERENCED'
    ) {

      return res.status(400).json({
        success: false,
        message:
          'Không thể xóa sản phẩm vì sản phẩm đang được sử dụng ở dữ liệu khác!'
      });
    }


    res.status(500).json({
      success: false,
      message:
        'Không thể xóa sản phẩm!'
    });
  }
});


// =====================================================
// MULTER ERROR
// =====================================================

router.use(
  (error, req, res, next) => {

    if (
      error instanceof multer.MulterError
    ) {

      if (
        error.code === 'LIMIT_FILE_SIZE'
      ) {

        return res.status(400).json({
          success: false,
          message:
            'Ảnh không được vượt quá 5MB!'
        });
      }


      return res.status(400).json({
        success: false,
        message:
          error.message ||
          'Lỗi upload ảnh!'
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
  }
);


// =====================================================
// EXPORT
// =====================================================

module.exports = router;