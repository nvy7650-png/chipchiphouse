const express = require('express');
const router = express.Router();

const db = require('../db');


// =====================================================
// CONSTANT
// =====================================================

const VALID_STATUSES = [
  'PENDING',
  'PAID',
  'PROCESSING',
  'SHIPPING',
  'COMPLETED',
  'CANCELLED'
];


// =====================================================
// HELPER
// =====================================================

const isValidId = (id) => {
  return id && !isNaN(id) && Number(id) > 0;
};


// =====================================================
// GET - DANH SÁCH ĐƠN HÀNG
//
// GET /api/orders
//
// Query:
// ?search=10001
// ?search=Nguyen
// ?status=PAID
//
// Có thể kết hợp:
// /api/orders?search=Nguyen&status=PAID
// =====================================================

router.get('/', async (req, res) => {

  try {

    const {
      search,
      status
    } = req.query;


    let sql = `

      SELECT

        o.id,
        o.user_id,
        o.total_amount,
        o.status,
        o.address,
        o.phone,
        o.created_at,

        u.name AS customer_name,
        u.email AS customer_email,
        u.phone AS customer_phone,

        COUNT(oi.id) AS item_count,

        COALESCE(
          SUM(oi.quantity),
          0
        ) AS total_quantity

      FROM orders o

      LEFT JOIN users u
        ON o.user_id = u.id

      LEFT JOIN order_items oi
        ON oi.order_id = o.id

      WHERE 1 = 1

    `;

    const params = [];


    // =================================================
    // SEARCH
    // =================================================

    if (search && search.trim()) {

      sql += `

        AND (

          CAST(o.id AS CHAR)
            LIKE ?

          OR LOWER(u.name)
            LIKE LOWER(?)

          OR LOWER(u.email)
            LIKE LOWER(?)

          OR o.phone
            LIKE ?

          OR u.phone
            LIKE ?

        )

      `;

      const keyword =
        `%${search.trim()}%`;

      params.push(
        keyword,
        keyword,
        keyword,
        keyword,
        keyword
      );
    }


    // =================================================
    // FILTER STATUS
    // =================================================

    if (
      status &&
      VALID_STATUSES.includes(
        status.toUpperCase()
      )
    ) {

      sql += `
        AND o.status = ?
      `;

      params.push(
        status.toUpperCase()
      );
    }


    // =================================================
    // GROUP
    // =================================================

    sql += `

      GROUP BY

        o.id,
        o.user_id,
        o.total_amount,
        o.status,
        o.address,
        o.phone,
        o.created_at,

        u.name,
        u.email,
        u.phone

      ORDER BY
        o.id DESC

    `;


    const [rows] =
      await db.query(
        sql,
        params
      );


    res.json({

      success: true,

      orders: rows

    });

  } catch (error) {

    console.error(
      'Lỗi lấy danh sách đơn hàng:',
      error
    );

    res.status(500).json({

      success: false,

      message:
        'Không thể lấy danh sách đơn hàng!'

    });
  }
});


// =====================================================
// GET - CHI TIẾT ĐƠN HÀNG
//
// GET /api/orders/:id
//
// Trả về:
// - thông tin đơn
// - thông tin khách
// - danh sách sản phẩm
// - giá setup hiện tại
// - giá thực tế trong đơn
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
          'ID đơn hàng không hợp lệ!'

      });
    }


    // =================================================
    // LẤY ORDER
    // =================================================

    const [orders] =
      await db.query(`

        SELECT

          o.id,
          o.user_id,
          o.total_amount,
          o.status,
          o.address,
          o.phone,
          o.created_at,

          u.name AS customer_name,
          u.email AS customer_email,
          u.phone AS customer_phone

        FROM orders o

        LEFT JOIN users u
          ON o.user_id = u.id

        WHERE o.id = ?

        LIMIT 1

      `, [id]);


    if (orders.length === 0) {

      return res.status(404).json({

        success: false,

        message:
          'Không tìm thấy đơn hàng!'

      });
    }


    // =================================================
    // LẤY ORDER ITEMS
    // =================================================

    const [items] =
      await db.query(`

        SELECT

          oi.id,
          oi.order_id,
          oi.product_id,
          oi.quantity,
          oi.price AS order_price,

          p.title,
          p.version_name,
          p.price AS product_price,
          p.image_url,
          p.category

        FROM order_items oi

        LEFT JOIN products p
          ON oi.product_id = p.id

        WHERE oi.order_id = ?

        ORDER BY oi.id ASC

      `, [id]);


    // =================================================
    // TÍNH TỔNG
    // =================================================

    let calculatedTotal = 0;


    const formattedItems =
      items.map((item) => {

        const quantity =
          Number(item.quantity) || 0;

        const orderPrice =
          Number(item.order_price) || 0;

        const productPrice =
          Number(item.product_price) || 0;

        const subtotal =
          quantity * orderPrice;


        calculatedTotal += subtotal;


        return {

          id: item.id,

          order_id:
            item.order_id,

          product_id:
            item.product_id,

          quantity,

          title:
            item.title ||
            'Sản phẩm đã bị xóa',

          version_name:
            item.version_name,

          category:
            item.category,

          image_url:
            item.image_url,

          // Giá setup hiện tại
          product_price:
            productPrice,

          // Giá thực tế của đơn
          order_price:
            orderPrice,

          subtotal

        };

      });


    // =================================================
    // RESPONSE
    // =================================================

    res.json({

      success: true,

      order: {

        ...orders[0],

        total_amount:
          Number(
            orders[0].total_amount
          ) || 0,

        calculated_total:
          calculatedTotal,

        items:
          formattedItems

      }

    });

  } catch (error) {

    console.error(
      'Lỗi lấy chi tiết đơn hàng:',
      error
    );

    res.status(500).json({

      success: false,

      message:
        'Không thể lấy chi tiết đơn hàng!'

    });
  }
});


// =====================================================
// PUT - SỬA GIÁ SẢN PHẨM TRONG ĐƠN
//
// PUT /api/orders/:id/items/:itemId/price
//
// Body:
//
// {
//   "price": 450000
// }
//
// order_items.price sẽ được cập nhật.
//
// products.price KHÔNG bị thay đổi.
//
// Sau đó tự tính lại orders.total_amount.
// =====================================================

router.put(
  '/:id/items/:itemId/price',
  async (req, res) => {

    const connection =
      await db.getConnection();

    try {

      const {
        id,
        itemId
      } = req.params;


      if (!isValidId(id)) {

        return res.status(400).json({

          success: false,

          message:
            'ID đơn hàng không hợp lệ!'

        });
      }


      if (!isValidId(itemId)) {

        return res.status(400).json({

          success: false,

          message:
            'ID sản phẩm trong đơn không hợp lệ!'

        });
      }


      const newPrice =
        Number(req.body.price);


      // =================================================
      // VALIDATE PRICE
      // =================================================

      if (
        req.body.price === undefined ||
        req.body.price === '' ||
        isNaN(newPrice) ||
        newPrice < 0
      ) {

        return res.status(400).json({

          success: false,

          message:
            'Giá bán không hợp lệ!'

        });
      }


      await connection.beginTransaction();


      // =================================================
      // KIỂM TRA ORDER
      // =================================================

      const [orders] =
        await connection.query(`

          SELECT

            id,
            status

          FROM orders

          WHERE id = ?

          LIMIT 1

          FOR UPDATE

        `, [id]);


      if (orders.length === 0) {

        await connection.rollback();

        return res.status(404).json({

          success: false,

          message:
            'Không tìm thấy đơn hàng!'

        });
      }


      // =================================================
      // KIỂM TRA ITEM
      // =================================================

      const [items] =
        await connection.query(`

          SELECT

            id,
            order_id,
            quantity,
            price

          FROM order_items

          WHERE id = ?

            AND order_id = ?

          LIMIT 1

          FOR UPDATE

        `, [
          itemId,
          id
        ]);


      if (items.length === 0) {

        await connection.rollback();

        return res.status(404).json({

          success: false,

          message:
            'Không tìm thấy sản phẩm trong đơn hàng!'

        });
      }


      // =================================================
      // UPDATE PRICE
      // =================================================

      await connection.query(`

        UPDATE order_items

        SET price = ?

        WHERE id = ?

          AND order_id = ?

      `, [
        newPrice,
        itemId,
        id
      ]);


      // =================================================
      // TÍNH LẠI TOTAL
      // =================================================

      const [totalRows] =
        await connection.query(`

          SELECT

            COALESCE(

              SUM(
                quantity * price
              ),

              0

            ) AS total_amount

          FROM order_items

          WHERE order_id = ?

        `, [id]);


      const newTotal =
        Number(
          totalRows[0]?.total_amount || 0
        );


      // =================================================
      // UPDATE ORDER TOTAL
      // =================================================

      await connection.query(`

        UPDATE orders

        SET total_amount = ?

        WHERE id = ?

      `, [
        newTotal,
        id
      ]);


      await connection.commit();


      res.json({

        success: true,

        message:
          'Cập nhật giá sản phẩm thành công!',

        order_id:
          Number(id),

        item_id:
          Number(itemId),

        price:
          newPrice,

        total_amount:
          newTotal

      });

    } catch (error) {

      await connection.rollback();

      console.error(
        'Lỗi cập nhật giá sản phẩm trong đơn:',
        error
      );

      res.status(500).json({

        success: false,

        message:
          'Không thể cập nhật giá sản phẩm!'

      });

    } finally {

      connection.release();

    }
  }
);


// =====================================================
// PUT - ĐỔI TRẠNG THÁI ĐƠN
//
// PUT /api/orders/:id/status
//
// Body:
//
// {
//   "status": "PROCESSING"
// }
// =====================================================

router.put(
  '/:id/status',
  async (req, res) => {

    try {

      const {
        id
      } = req.params;


      if (!isValidId(id)) {

        return res.status(400).json({

          success: false,

          message:
            'ID đơn hàng không hợp lệ!'

        });
      }


      const newStatus =
        String(
          req.body.status || ''
        )
          .trim()
          .toUpperCase();


      if (
        !VALID_STATUSES.includes(
          newStatus
        )
      ) {

        return res.status(400).json({

          success: false,

          message:
            'Trạng thái đơn hàng không hợp lệ!'

        });
      }


      // =================================================
      // KIỂM TRA ORDER
      // =================================================

      const [orders] =
        await db.query(`

          SELECT
            id

          FROM orders

          WHERE id = ?

          LIMIT 1

        `, [id]);


      if (orders.length === 0) {

        return res.status(404).json({

          success: false,

          message:
            'Không tìm thấy đơn hàng!'

        });
      }


      // =================================================
      // UPDATE
      // =================================================

      await db.query(`

        UPDATE orders

        SET status = ?

        WHERE id = ?

      `, [
        newStatus,
        id
      ]);


      res.json({

        success: true,

        message:
          'Cập nhật trạng thái đơn hàng thành công!',

        status:
          newStatus

      });

    } catch (error) {

      console.error(
        'Lỗi cập nhật trạng thái:',
        error
      );

      res.status(500).json({

        success: false,

        message:
          'Không thể cập nhật trạng thái đơn hàng!'

      });
    }
  }
);


// =====================================================
// DELETE - XÓA ĐƠN HÀNG
//
// DELETE /api/orders/:id
//
// Chỉ cho xóa đơn chưa thanh toán.
// =====================================================

router.delete('/:id', async (req, res) => {

  const connection =
    await db.getConnection();

  try {

    const {
      id
    } = req.params;


    if (!isValidId(id)) {

      return res.status(400).json({

        success: false,

        message:
          'ID đơn hàng không hợp lệ!'

      });
    }


    await connection.beginTransaction();


    // =================================================
    // KIỂM TRA ORDER
    // =================================================

    const [orders] =
      await connection.query(`

        SELECT

          id,
          status

        FROM orders

        WHERE id = ?

        LIMIT 1

        FOR UPDATE

      `, [id]);


    if (orders.length === 0) {

      await connection.rollback();

      return res.status(404).json({

        success: false,

        message:
          'Không tìm thấy đơn hàng!'

      });
    }


    const orderStatus =
      String(
        orders[0].status || ''
      ).toUpperCase();


    // =================================================
    // KHÔNG CHO XÓA ĐƠN ĐÃ THANH TOÁN
    // =================================================

    if (
      [
        'PAID',
        'PROCESSING',
        'SHIPPING',
        'COMPLETED'
      ].includes(orderStatus)
    ) {

      await connection.rollback();

      return res.status(400).json({

        success: false,

        message:
          'Không thể xóa đơn hàng đã thanh toán hoặc đang xử lý!'

      });
    }


    // =================================================
    // XÓA ORDER ITEMS
    // =================================================

    await connection.query(`

      DELETE FROM order_items

      WHERE order_id = ?

    `, [id]);


    // =================================================
    // XÓA ORDER
    // =================================================

    await connection.query(`

      DELETE FROM orders

      WHERE id = ?

    `, [id]);


    await connection.commit();


    res.json({

      success: true,

      message:
        'Xóa đơn hàng thành công!'

    });

  } catch (error) {

    await connection.rollback();

    console.error(
      'Lỗi xóa đơn hàng:',
      error
    );

    res.status(500).json({

      success: false,

      message:
        'Không thể xóa đơn hàng!'

    });

  } finally {

    connection.release();

  }
});


module.exports = router;