const express = require('express');
const router = express.Router();

const db = require('../db');

// =====================================================
// CONSTANT
// =====================================================

const VALID_STATUSES = [
  'PENDING',
  'CONFIRMED',
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
// GET /api/orders
// =====================================================

router.get('/', async (req, res) => {
  try {
    const { search, status } = req.query;

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
        COALESCE(SUM(oi.quantity), 0) AS total_quantity
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE 1 = 1
    `;

    const params = [];

    if (search && search.trim()) {
      sql += `
        AND (
          CAST(o.id AS CHAR) LIKE ?
          OR LOWER(u.name) LIKE LOWER(?)
          OR LOWER(u.email) LIKE LOWER(?)
          OR o.phone LIKE ?
          OR u.phone LIKE ?
        )
      `;
      const keyword = `%${search.trim()}%`;
      params.push(keyword, keyword, keyword, keyword, keyword);
    }

    if (status && VALID_STATUSES.includes(status.toUpperCase())) {
      sql += ` AND o.status = ? `;
      params.push(status.toUpperCase());
    }

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
      ORDER BY o.id DESC
    `;

    const [rows] = await db.query(sql, params);

    res.json({
      success: true,
      orders: rows
    });
  } catch (error) {
    console.error('Lỗi lấy danh sách đơn hàng:', error);
    res.status(500).json({
      success: false,
      message: 'Không thể lấy danh sách đơn hàng!'
    });
  }
});

// =====================================================
// GET - TÌM KHÁCH HÀNG
// GET /api/orders/customers
// =====================================================

router.get('/customers', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        id,
        name,
        email,
        phone
      FROM users
      WHERE role = 'customer'
      ORDER BY id DESC
    `);

    res.json({
      success: true,
      customers: rows
    });
  } catch (error) {
    console.error('Lỗi lấy khách hàng:', error);
    res.status(500).json({
      success: false,
      message: 'Không thể lấy danh sách khách hàng!'
    });
  }
});

// =====================================================
// GET - LẤY SẢN PHẨM CHO TẠO ĐƠN HÀNG
// GET /api/orders/products
// =====================================================

router.get('/products', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        p.id,
        p.title,
        p.version_name,
        p.price,
        p.stock,
        p.image_url,
        p.category,
        a.name AS album_name,
        g.name AS group_name
      FROM products p
      LEFT JOIN albums a ON p.album_id = a.id
      LEFT JOIN kpop_groups g ON a.group_id = g.id
      WHERE p.stock > 0
      ORDER BY p.title ASC
    `);

    res.json({
      success: true,
      products: rows
    });
  } catch (error) {
    console.error('Lỗi lấy sản phẩm cho đơn hàng:', error);
    res.status(500).json({
      success: false,
      message: 'Không thể lấy danh sách sản phẩm!'
    });
  }
});

// =====================================================
// POST - TẠO ĐƠN HÀNG MỚI (Đã khắc phục lỗi tạo user & bảng orders)
// POST /api/orders
// =====================================================

router.post('/', async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { user_id, customer_name, phone, address, note, items } = req.body;

    if (!customer_name || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ tên khách hàng và số điện thoại!'
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Đơn hàng phải chứa ít nhất 1 sản phẩm!'
      });
    }

    await connection.beginTransaction();

    // 1. Kiểm tra / Tìm hoặc Tạo mới User dựa vào Số điện thoại
    let finalUserId = user_id;

    if (!finalUserId) {
      const [existingUsers] = await connection.query(
        `SELECT id FROM users WHERE phone = ? LIMIT 1`,
        [phone]
      );

      if (existingUsers.length > 0) {
        finalUserId = existingUsers[0].id;
      } else {
        // Nếu chưa tồn tại -> Tạo mới customer trong bảng users
        const [newUserResult] = await connection.query(
          `INSERT INTO users (name, phone, role) VALUES (?, ?, 'customer')`,
          [customer_name, phone]
        );
        finalUserId = newUserResult.insertId;
      }
    }

    // 2. Tính tổng tiền đơn hàng
    let totalAmount = 0;
    for (const item of items) {
      totalAmount += Number(item.price) * Number(item.quantity);
    }

    // 3. Chèn đơn hàng mới (Bỏ customer_name vì không có trong schema orders)
    const [orderResult] = await connection.query(
      `
      INSERT INTO orders (user_id, phone, address, note, total_amount, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING', NOW())
    `,
      [
        finalUserId,
        phone,
        address || '',
        note || '',
        totalAmount
      ]
    );

    const newOrderId = orderResult.insertId;

    // 4. Chèn chi tiết đơn hàng & Trừ tồn kho sản phẩm
    for (const item of items) {
      await connection.query(
        `
        INSERT INTO order_items (order_id, product_id, quantity, price)
        VALUES (?, ?, ?, ?)
      `,
        [newOrderId, item.product_id, item.quantity, item.price]
      );

      await connection.query(
        `
        UPDATE products 
        SET stock = GREATEST(0, stock - ?) 
        WHERE id = ?
      `,
        [item.quantity, item.product_id]
      );
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Tạo đơn hàng thành công!',
      order: {
        id: newOrderId,
        user_id: finalUserId,
        customer_name,
        phone,
        address,
        total_amount: totalAmount,
        items
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Lỗi tạo đơn hàng chi tiết:', error);
    res.status(500).json({
      success: false,
      message: 'Không thể tạo đơn hàng!',
      error: error.message
    });
  } finally {
    connection.release();
  }
});

// =====================================================
// GET - CHI TIẾT ĐƠN HÀNG
// GET /api/orders/:id
// =====================================================

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID đơn hàng không hợp lệ!'
      });
    }

    const [orders] = await db.query(
      `
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
        LEFT JOIN users u ON o.user_id = u.id
        WHERE o.id = ?
        LIMIT 1
      `,
      [id]
    );

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn hàng!'
      });
    }

    const [items] = await db.query(
      `
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
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = ?
        ORDER BY oi.id ASC
      `,
      [id]
    );

    let calculatedTotal = 0;

    const formattedItems = items.map((item) => {
      const quantity = Number(item.quantity) || 0;
      const orderPrice = Number(item.order_price) || 0;
      const productPrice = Number(item.product_price) || 0;
      const subtotal = quantity * orderPrice;

      calculatedTotal += subtotal;

      return {
        id: item.id,
        order_id: item.order_id,
        product_id: item.product_id,
        quantity,
        title: item.title || 'Sản phẩm đã bị xóa',
        version_name: item.version_name,
        category: item.category,
        image_url: item.image_url,
        product_price: productPrice,
        order_price: orderPrice,
        subtotal
      };
    });

    res.json({
      success: true,
      order: {
        ...orders[0],
        total_amount: Number(orders[0].total_amount) || 0,
        calculated_total: calculatedTotal,
        items: formattedItems
      }
    });
  } catch (error) {
    console.error('Lỗi lấy chi tiết đơn hàng:', error);
    res.status(500).json({
      success: false,
      message: 'Không thể lấy chi tiết đơn hàng!'
    });
  }
});

// =====================================================
// PUT - SỬA GIÁ SẢN PHẨM TRONG ĐƠN
// PUT /api/orders/:id/items/:itemId/price
// =====================================================

router.put('/:id/items/:itemId/price', async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { id, itemId } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID đơn hàng không hợp lệ!'
      });
    }

    if (!isValidId(itemId)) {
      return res.status(400).json({
        success: false,
        message: 'ID sản phẩm trong đơn không hợp lệ!'
      });
    }

    const newPrice = Number(req.body.price);

    if (
      req.body.price === undefined ||
      req.body.price === '' ||
      isNaN(newPrice) ||
      newPrice < 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'Giá bán không hợp lệ!'
      });
    }

    await connection.beginTransaction();

    const [orders] = await connection.query(
      `
          SELECT id, status
          FROM orders
          WHERE id = ?
          LIMIT 1
          FOR UPDATE
        `,
      [id]
    );

    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn hàng!'
      });
    }

    const [items] = await connection.query(
      `
          SELECT id, order_id, quantity, price
          FROM order_items
          WHERE id = ? AND order_id = ?
          LIMIT 1
          FOR UPDATE
        `,
      [itemId, id]
    );

    if (items.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy sản phẩm trong đơn hàng!'
      });
    }

    await connection.query(
      `
        UPDATE order_items
        SET price = ?
        WHERE id = ? AND order_id = ?
      `,
      [newPrice, itemId, id]
    );

    const [totalRows] = await connection.query(
      `
          SELECT COALESCE(SUM(quantity * price), 0) AS total_amount
          FROM order_items
          WHERE order_id = ?
        `,
      [id]
    );

    const newTotal = Number(totalRows[0]?.total_amount || 0);

    await connection.query(
      `
        UPDATE orders
        SET total_amount = ?
        WHERE id = ?
      `,
      [newTotal, id]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'Cập nhật giá sản phẩm thành công!',
      order_id: Number(id),
      item_id: Number(itemId),
      price: newPrice,
      total_amount: newTotal
    });
  } catch (error) {
    await connection.rollback();
    console.error('Lỗi cập nhật giá sản phẩm trong đơn:', error);
    res.status(500).json({
      success: false,
      message: 'Không thể cập nhật giá sản phẩm!'
    });
  } finally {
    connection.release();
  }
});

// =====================================================
// PUT - ĐỔI TRẠNG THÁI ĐƠN
// PUT /api/orders/:id/status
// =====================================================

router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID đơn hàng không hợp lệ!'
      });
    }

    const newStatus = String(req.body.status || '')
      .trim()
      .toUpperCase();

    if (!VALID_STATUSES.includes(newStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Trạng thái đơn hàng không hợp lệ!'
      });
    }

    const [orders] = await db.query(
      `
          SELECT id FROM orders WHERE id = ? LIMIT 1
        `,
      [id]
    );

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn hàng!'
      });
    }

    await db.query(
      `
        UPDATE orders SET status = ? WHERE id = ?
      `,
      [newStatus, id]
    );

    res.json({
      success: true,
      message: 'Cập nhật trạng thái đơn hàng thành công!',
      status: newStatus
    });
  } catch (error) {
    console.error('Lỗi cập nhật trạng thái:', error);
    res.status(500).json({
      success: false,
      message: 'Không thể cập nhật trạng thái đơn hàng!'
    });
  }
});

// =====================================================
// DELETE - XÓA ĐƠN HÀNG
// DELETE /api/orders/:id
// =====================================================

router.delete('/:id', async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID đơn hàng không hợp lệ!'
      });
    }

    await connection.beginTransaction();

    const [orders] = await connection.query(
      `
        SELECT id, status FROM orders WHERE id = ? LIMIT 1 FOR UPDATE
      `,
      [id]
    );

    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn hàng!'
      });
    }

    const orderStatus = String(orders[0].status || '').toUpperCase();

    if (['PAID', 'PROCESSING', 'SHIPPING', 'COMPLETED'].includes(orderStatus)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Không thể xóa đơn hàng đã thanh toán hoặc đang xử lý!'
      });
    }

    await connection.query(`DELETE FROM order_items WHERE order_id = ?`, [id]);
    await connection.query(`DELETE FROM orders WHERE id = ?`, [id]);

    await connection.commit();

    res.json({
      success: true,
      message: 'Xóa đơn hàng thành công!'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Lỗi xóa đơn hàng:', error);
    res.status(500).json({
      success: false,
      message: 'Không thể xóa đơn hàng!'
    });
  } finally {
    connection.release();
  }
});

module.exports = router;