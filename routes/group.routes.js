const express = require('express');
const router = express.Router();

const db = require('../db');


// ======================================================
// GET - LẤY TẤT CẢ NHÓM NHẠC
// GET /api/groups
// ======================================================

router.get('/', async (req, res) => {
  try {

    const [rows] = await db.query(`
      SELECT
        id,
        name
      FROM kpop_groups
      ORDER BY id DESC
    `);

    res.json({
      success: true,
      groups: rows
    });

  } catch (error) {

    console.error('Lỗi lấy nhóm nhạc:', error);

    res.status(500).json({
      success: false,
      message: 'Không thể lấy danh sách nhóm nhạc!'
    });

  }
});


// ======================================================
// POST - THÊM NHÓM NHẠC
// POST /api/groups
// ======================================================

router.post('/', async (req, res) => {
  try {

    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Tên nhóm nhạc không được để trống!'
      });
    }

    const groupName = name.trim();


    // Kiểm tra trùng tên
    const [existing] = await db.query(`
      SELECT
        id
      FROM kpop_groups
      WHERE LOWER(name) = LOWER(?)
      LIMIT 1
    `, [groupName]);


    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Nhóm nhạc này đã tồn tại!'
      });
    }


    // Thêm nhóm
    const [result] = await db.query(`
      INSERT INTO kpop_groups (name)
      VALUES (?)
    `, [groupName]);


    // Lấy lại nhóm vừa thêm
    const [rows] = await db.query(`
      SELECT
        id,
        name
      FROM kpop_groups
      WHERE id = ?
    `, [result.insertId]);


    res.status(201).json({
      success: true,
      message: 'Thêm nhóm nhạc thành công!',
      group: rows[0]
    });

  } catch (error) {

    console.error('Lỗi thêm nhóm nhạc:', error);

    res.status(500).json({
      success: false,
      message: 'Không thể thêm nhóm nhạc!'
    });

  }
});


// ======================================================
// PUT - CẬP NHẬT NHÓM NHẠC
// PUT /api/groups/:id
// ======================================================

router.put('/:id', async (req, res) => {
  try {

    const { id } = req.params;
    const { name } = req.body;


    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID nhóm nhạc không hợp lệ!'
      });
    }


    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Tên nhóm nhạc không được để trống!'
      });
    }


    const groupName = name.trim();


    // Kiểm tra nhóm tồn tại
    const [existingGroup] = await db.query(`
      SELECT
        id
      FROM kpop_groups
      WHERE id = ?
      LIMIT 1
    `, [id]);


    if (existingGroup.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhóm nhạc!'
      });
    }


    // Kiểm tra trùng tên
    const [duplicate] = await db.query(`
      SELECT
        id
      FROM kpop_groups
      WHERE LOWER(name) = LOWER(?)
        AND id <> ?
      LIMIT 1
    `, [groupName, id]);


    if (duplicate.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Tên nhóm nhạc này đã tồn tại!'
      });
    }


    // Cập nhật
    await db.query(`
      UPDATE kpop_groups
      SET name = ?
      WHERE id = ?
    `, [groupName, id]);


    // Lấy lại dữ liệu
    const [rows] = await db.query(`
      SELECT
        id,
        name
      FROM kpop_groups
      WHERE id = ?
    `, [id]);


    res.json({
      success: true,
      message: 'Cập nhật nhóm nhạc thành công!',
      group: rows[0]
    });

  } catch (error) {

    console.error('Lỗi cập nhật nhóm nhạc:', error);

    res.status(500).json({
      success: false,
      message: 'Không thể cập nhật nhóm nhạc!'
    });

  }
});


// ======================================================
// DELETE - XÓA NHÓM NHẠC
// DELETE /api/groups/:id
// ======================================================

router.delete('/:id', async (req, res) => {
  try {

    const { id } = req.params;


    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID nhóm nhạc không hợp lệ!'
      });
    }


    // Kiểm tra nhóm tồn tại
    const [existing] = await db.query(`
      SELECT
        id
      FROM kpop_groups
      WHERE id = ?
      LIMIT 1
    `, [id]);


    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhóm nhạc!'
      });
    }


    // Kiểm tra nhóm có album
    const [albums] = await db.query(`
      SELECT
        id
      FROM albums
      WHERE group_id = ?
      LIMIT 1
    `, [id]);


    if (albums.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          'Không thể xóa nhóm nhạc vì nhóm này đang có album!'
      });
    }


    // Xóa nhóm
    await db.query(`
      DELETE FROM kpop_groups
      WHERE id = ?
    `, [id]);


    res.json({
      success: true,
      message: 'Xóa nhóm nhạc thành công!'
    });

  } catch (error) {

    console.error('Lỗi xóa nhóm nhạc:', error);

    res.status(500).json({
      success: false,
      message: 'Không thể xóa nhóm nhạc!'
    });

  }
});

// ======================================================
// GET - LẤY ALBUM CỦA NHÓM
// GET /api/groups/:id/albums
// ======================================================
//
// Cấu trúc:
//
// kpop_groups
//      ↓
//    albums
//      ↓
//   products
//
// 1 nhóm có nhiều album
// 1 album có nhiều version
// 1 product = 1 version
// ======================================================

router.get('/:id/albums', async (req, res) => {
  try {

    const { id } = req.params;


    // ==================================================
    // KIỂM TRA ID
    // ==================================================

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID nhóm nhạc không hợp lệ!'
      });
    }


    // ==================================================
    // LẤY THÔNG TIN NHÓM
    // ==================================================

    const [groups] = await db.query(`
      SELECT
        id,
        name
      FROM kpop_groups
      WHERE id = ?
      LIMIT 1
    `, [id]);


    if (groups.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhóm nhạc!'
      });
    }


    // ==================================================
    // LẤY ALBUM
    // ==================================================

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
        ON p.album_id = a.id

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
    `, [id]);


    // ==================================================
    // RESPONSE
    // ==================================================

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

// ======================================================
// GET - LẤY CHI TIẾT NHÓM NHẠC
// GET /api/groups/:id
// ======================================================

router.get('/:id', async (req, res) => {
  try {

    const { id } = req.params;


    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID nhóm nhạc không hợp lệ!'
      });
    }


    const [rows] = await db.query(`
      SELECT
        id,
        name
      FROM kpop_groups
      WHERE id = ?
      LIMIT 1
    `, [id]);


    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhóm nhạc!'
      });
    }


    res.json({
      success: true,
      group: rows[0]
    });

  } catch (error) {

    console.error('Lỗi lấy chi tiết nhóm:', error);

    res.status(500).json({
      success: false,
      message: 'Không thể lấy thông tin nhóm nhạc!'
    });

  }
});





module.exports = router;