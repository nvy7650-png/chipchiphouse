const express = require('express');
const router = express.Router();
const db = require('../db');

// ==========================================
// GET ADMIN DASHBOARD STATISTICS
// GET /api/admin/stats?period=month
// GET /api/admin/stats?period=day
// ==========================================
router.get('/stats', async (req, res) => {
  try {
    const period = req.query.period || 'month';

    // ==========================================
    // 1. TỔNG KHÁCH HÀNG
    // Chỉ tính role = user
    // ==========================================
    const [usersResult] = await db.query(`
      SELECT COUNT(*) AS totalUsers
      FROM users
      WHERE role = 'user'
    `);

    // ==========================================
    // 2. TỔNG SẢN PHẨM
    // ==========================================
    const [productsResult] = await db.query(`
      SELECT COUNT(*) AS totalProducts
      FROM products
    `);

    // ==========================================
    // 3. TỔNG ĐƠN HÀNG
    // ==========================================
    const [ordersResult] = await db.query(`
      SELECT COUNT(*) AS totalOrders
      FROM orders
    `);

    // ==========================================
    // 4. TỔNG DOANH THU
    // Chỉ tính đơn completed
    // ==========================================
    const [revenueResult] = await db.query(`
      SELECT COALESCE(SUM(total_amount), 0) AS totalRevenue
      FROM orders
      WHERE status = 'completed'
    `);

    // ==========================================
    // 5. ĐƠN HÀNG MỚI NHẤT
    // ƯU TIÊN HIỂN THỊ ĐẦU TIÊN
    // ==========================================
    const [recentOrders] = await db.query(`
      SELECT
        o.id,
        o.total_amount,
        o.status,
        o.created_at,
        u.name AS customer
      FROM orders o
      LEFT JOIN users u
        ON o.user_id = u.id
      ORDER BY o.created_at DESC
      LIMIT 10
    `);

    // ==========================================
    // 6. THỐNG KÊ THEO NGÀY
    // ==========================================
    const [dailyStats] = await db.query(`
      SELECT
        DATE(created_at) AS date,
        COUNT(*) AS orders,
        COALESCE(
          SUM(
            CASE
              WHEN status = 'completed'
              THEN total_amount
              ELSE 0
            END
          ),
          0
        ) AS revenue
      FROM orders
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    // ==========================================
    // 7. THỐNG KÊ THEO THÁNG
    // ==========================================
    const [monthlyStats] = await db.query(`
      SELECT
        DATE_FORMAT(created_at, '%Y-%m') AS month,
        COUNT(*) AS orders,
        COALESCE(
          SUM(
            CASE
              WHEN status = 'completed'
              THEN total_amount
              ELSE 0
            END
          ),
          0
        ) AS revenue
      FROM orders
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month ASC
    `);

    // ==========================================
    // 8. THỐNG KÊ TRONG THÁNG HIỆN TẠI
    // ==========================================
    const [currentMonthResult] = await db.query(`
      SELECT
        COUNT(*) AS orders,
        COALESCE(
          SUM(
            CASE
              WHEN status = 'completed'
              THEN total_amount
              ELSE 0
            END
          ),
          0
        ) AS revenue
      FROM orders
      WHERE YEAR(created_at) = YEAR(CURDATE())
        AND MONTH(created_at) = MONTH(CURDATE())
    `);

    // ==========================================
    // 9. THỐNG KÊ TRONG NGÀY HÔM NAY
    // ==========================================
    const [todayResult] = await db.query(`
      SELECT
        COUNT(*) AS orders,
        COALESCE(
          SUM(
            CASE
              WHEN status = 'completed'
              THEN total_amount
              ELSE 0
            END
          ),
          0
        ) AS revenue
      FROM orders
      WHERE DATE(created_at) = CURDATE()
    `);

    // ==========================================
    // RESPONSE
    // ==========================================
    res.json({
      success: true,

      stats: {
        totalRevenue: Number(
          revenueResult[0]?.totalRevenue || 0
        ),

        totalOrders: Number(
          ordersResult[0]?.totalOrders || 0
        ),

        totalProducts: Number(
          productsResult[0]?.totalProducts || 0
        ),

        totalUsers: Number(
          usersResult[0]?.totalUsers || 0
        ),

        currentMonth: {
          revenue: Number(
            currentMonthResult[0]?.revenue || 0
          ),
          orders: Number(
            currentMonthResult[0]?.orders || 0
          )
        },

        today: {
          revenue: Number(
            todayResult[0]?.revenue || 0
          ),
          orders: Number(
            todayResult[0]?.orders || 0
          )
        }
      },

      recentOrders,

      charts: {
        daily: dailyStats.map(item => ({
          date: item.date,
          orders: Number(item.orders),
          revenue: Number(item.revenue)
        })),

        monthly: monthlyStats.map(item => ({
          month: item.month,
          orders: Number(item.orders),
          revenue: Number(item.revenue)
        }))
      }
    });

  } catch (error) {
    console.error(
      'Lỗi lấy thống kê admin:',
      error
    );

    res.status(500).json({
      success: false,
      message: 'Không thể lấy dữ liệu dashboard'
    });
  }
});

module.exports = router;