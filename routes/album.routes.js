const express = require('express');
const router = express.Router();

const db = require('../db');


// =========================================================
// GET - LẤY TẤT CẢ ALBUM
// GET /api/albums
// =========================================================

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

        COUNT(p.id) AS version_count

      FROM albums a

      LEFT JOIN kpop_groups g
        ON a.group_id = g.id

      LEFT JOIN products p
        ON p.album_id = a.id

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
    console.error('Lỗi lấy danh sách album:', error);

    res.status(500).json({
      success: false,
      message: 'Không thể lấy danh sách album!'
    });
  }
});


// =========================================================
// GET - LẤY ALBUM THEO NHÓM
// GET /api/albums/group/:groupId
// =========================================================

router.get('/group/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!groupId || isNaN(groupId)) {
      return res.status(400).json({
        success: false,
        message: 'ID nhóm nhạc không hợp lệ!'
      });
    }

    // -----------------------------------------------------
    // Kiểm tra nhóm tồn tại
    // -----------------------------------------------------

    const [groups] = await db.query(
      `
      SELECT
        id,
        name
      FROM kpop_groups
      WHERE id = ?
      LIMIT 1
      `,
      [groupId]
    );

    if (groups.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhóm nhạc!'
      });
    }


    // -----------------------------------------------------
    // Lấy album của nhóm
    // -----------------------------------------------------

    const [albums] = await db.query(
      `
      SELECT
        a.id,
        a.group_id,
        a.name,
        a.release_date,
        a.description,
        a.image_url,
        a.created_at,

        COUNT(p.id) AS version_count

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
      `,
      [groupId]
    );


    res.json({
      success: true,
      group: groups[0],
      albums
    });

  } catch (error) {

    console.error('Lỗi lấy album của nhóm:', error);

    res.status(500).json({
      success: false,
      message: 'Không thể lấy album của nhóm!'
    });
  }
});


// =========================================================
// GET - LẤY CHI TIẾT ALBUM
// GET /api/albums/:id
// =========================================================

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID album không hợp lệ!'
      });
    }


    const [albums] = await db.query(
      `
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
      `,
      [id]
    );


    if (albums.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy album!'
      });
    }


    // -----------------------------------------------------
    // Lấy các version/product của album
    // -----------------------------------------------------

    const [products] = await db.query(
      `
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

      ORDER BY id DESC
      `,
      [id]
    );


    res.json({
      success: true,
      album: albums[0],
      products
    });

  } catch (error) {

    console.error('Lỗi lấy chi tiết album:', error);

    res.status(500).json({
      success: false,
      message: 'Không thể lấy thông tin album!'
    });
  }
});


// =========================================================
// POST - THÊM ALBUM
// POST /api/albums
// =========================================================

router.post('/', async (req, res) => {
  try {

    const {
      group_id,
      name,
      release_date,
      description,
      image_url
    } = req.body;


    // -----------------------------------------------------
    // Validate group_id
    // -----------------------------------------------------

    if (!group_id || isNaN(group_id)) {
      return res.status(400).json({
        success: false,
        message: 'ID nhóm nhạc không hợp lệ!'
      });
    }


    // -----------------------------------------------------
    // Validate tên album
    // -----------------------------------------------------

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Tên album không được để trống!'
      });
    }


    const albumName = name.trim();


    // -----------------------------------------------------
    // Kiểm tra nhóm tồn tại
    // -----------------------------------------------------

    const [groups] = await db.query(
      `
      SELECT id
      FROM kpop_groups
      WHERE id = ?
      LIMIT 1
      `,
      [group_id]
    );


    if (groups.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhóm nhạc!'
      });
    }


    // -----------------------------------------------------
    // Kiểm tra album trùng tên trong cùng nhóm
    // -----------------------------------------------------

    const [existing] = await db.query(
      `
      SELECT id
      FROM albums
      WHERE group_id = ?
        AND LOWER(name) = LOWER(?)
      LIMIT 1
      `,
      [group_id, albumName]
    );


    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Album này đã tồn tại trong nhóm!'
      });
    }


    // -----------------------------------------------------
    // INSERT
    // -----------------------------------------------------

    const [result] = await db.query(
      `
      INSERT INTO albums
      (
        group_id,
        name,
        release_date,
        description,
        image_url
      )
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        group_id,
        albumName,
        release_date || null,
        description || null,
        image_url || null
      ]
    );


    // -----------------------------------------------------
    // Lấy album vừa tạo
    // -----------------------------------------------------

    const [rows] = await db.query(
      `
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

      LIMIT 1
      `,
      [result.insertId]
    );


    res.status(201).json({
      success: true,
      message: 'Thêm album thành công!',
      album: rows[0]
    });

  } catch (error) {

    console.error('Lỗi thêm album:', error);

    res.status(500).json({
      success: false,
      message: 'Không thể thêm album!'
    });
  }
});


// =========================================================
// PUT - CẬP NHẬT ALBUM
// PUT /api/albums/:id
// =========================================================

router.put('/:id', async (req, res) => {
  try {

    const { id } = req.params;

    const {
      group_id,
      name,
      release_date,
      description,
      image_url
    } = req.body;


    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID album không hợp lệ!'
      });
    }


    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Tên album không được để trống!'
      });
    }


    const albumName = name.trim();


    // -----------------------------------------------------
    // Kiểm tra album
    // -----------------------------------------------------

    const [existingAlbum] = await db.query(
      `
      SELECT id, group_id
      FROM albums
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );


    if (existingAlbum.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy album!'
      });
    }


    const finalGroupId =
      group_id || existingAlbum[0].group_id;


    // -----------------------------------------------------
    // Kiểm tra nhóm
    // -----------------------------------------------------

    const [groups] = await db.query(
      `
      SELECT id
      FROM kpop_groups
      WHERE id = ?
      LIMIT 1
      `,
      [finalGroupId]
    );


    if (groups.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhóm nhạc!'
      });
    }


    // -----------------------------------------------------
    // Kiểm tra trùng tên
    // -----------------------------------------------------

    const [duplicate] = await db.query(
      `
      SELECT id
      FROM albums

      WHERE group_id = ?
        AND LOWER(name) = LOWER(?)
        AND id <> ?

      LIMIT 1
      `,
      [
        finalGroupId,
        albumName,
        id
      ]
    );


    if (duplicate.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Album này đã tồn tại trong nhóm!'
      });
    }


    // -----------------------------------------------------
    // UPDATE
    // -----------------------------------------------------

    await db.query(
      `
      UPDATE albums

      SET
        group_id = ?,
        name = ?,
        release_date = ?,
        description = ?,
        image_url = ?

      WHERE id = ?
      `,
      [
        finalGroupId,
        albumName,
        release_date || null,
        description || null,
        image_url || null,
        id
      ]
    );


    // -----------------------------------------------------
    // Lấy lại album
    // -----------------------------------------------------

    const [rows] = await db.query(
      `
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

      LIMIT 1
      `,
      [id]
    );


    res.json({
      success: true,
      message: 'Cập nhật album thành công!',
      album: rows[0]
    });

  } catch (error) {

    console.error('Lỗi cập nhật album:', error);

    res.status(500).json({
      success: false,
      message: 'Không thể cập nhật album!'
    });
  }
});


// =========================================================
// DELETE - XÓA ALBUM
// DELETE /api/albums/:id
// =========================================================

router.delete('/:id', async (req, res) => {
  try {

    const { id } = req.params;


    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID album không hợp lệ!'
      });
    }


    // -----------------------------------------------------
    // Kiểm tra album
    // -----------------------------------------------------

    const [albums] = await db.query(
      `
      SELECT
        id,
        name
      FROM albums
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );


    if (albums.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy album!'
      });
    }


    // -----------------------------------------------------
    // Kiểm tra album có product/version không
    // -----------------------------------------------------

    const [products] = await db.query(
      `
      SELECT id
      FROM products
      WHERE album_id = ?
      LIMIT 1
      `,
      [id]
    );


    if (products.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          'Không thể xóa album vì album đang có version sản phẩm!'
      });
    }


    // -----------------------------------------------------
    // DELETE
    // -----------------------------------------------------

    await db.query(
      `
      DELETE FROM albums
      WHERE id = ?
      `,
      [id]
    );


    res.json({
      success: true,
      message: 'Xóa album thành công!'
    });

  } catch (error) {

    console.error('Lỗi xóa album:', error);

    res.status(500).json({
      success: false,
      message: 'Không thể xóa album!'
    });
  }
});


module.exports = router;