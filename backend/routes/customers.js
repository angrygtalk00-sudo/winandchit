const express = require('express');
const Customer = require('../models/customer');
const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const c = new Customer(req.body);
    await c.save();
    res.json(c);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  const list = await Customer.find().limit(200);
  res.json(list);
});

module.exports = router;
