const express = require('express');
const Category = require('../models/category');

const router = express.Router();
const Backup = require('../models/backup');

const DEFAULT_CATEGORIES = [
  {
    name: 'Clothing',
    description: 'T-Shirts, Dresses, Shirts, Pants, Hoodies, and Jackets',
    subcategories: ['Girl', 'Boy', 'Baby'],
    attributes: [
      {
        name: 'Color',
        type: 'select',
        options: ['Black', 'White', 'Red', 'Blue', 'Navy Blue', 'Sky Blue', 'Green', 'Olive Green', 'Yellow', 'Pink', 'Purple', 'Grey', 'Brown', 'Beige', 'Maroon', 'Khaki', 'Pattern / Multi']
      },
      {
        name: 'Size',
        type: 'select',
        options: ['Free Size', 'XS', 'S', 'M', 'L', 'XL', '2XL (XXL)', '3XL', '4XL', '28', '29', '30', '31', '32', '33', '34', '36', '38']
      }
    ]
  },
  {
    name: 'Face Cleaning & Skincare',
    description: 'Facial cleanser, foam, toner, serums, and masks',
    attributes: [
      {
        name: 'Scent / Type',
        type: 'select',
        options: ['Tea Tree', 'Aloe Vera', 'Centella / Cica', 'Vitamin C', 'Hyaluronic Acid', 'Green Tea', 'Charcoal', 'Rice Water', 'Unscented']
      },
      {
        name: 'Volume / Weight',
        type: 'select',
        options: ['30ml', '50ml', '100ml', '120ml', '150ml', '200ml', '250ml', '50g', '100g', 'Single Pack', 'Set of 3']
      }
    ]
  },
  {
    name: 'Cosmetics & Beauty',
    description: 'Lipsticks, foundation, cushion, and eye makeup',
    attributes: [
      {
        name: 'Shade / Tone',
        type: 'select',
        options: ['#01 Light Beige', '#02 Natural Beige', '#03 Warm Sand', 'Ruby Red', 'Nude Pink', 'Coral Rose', 'Cherry']
      },
      {
        name: 'Type / Finish',
        type: 'select',
        options: ['Matte', 'Glossy', 'Velvet', 'Dewy', 'Waterproof']
      }
    ]
  },
  {
    name: 'Footwear',
    description: 'Shoes, sneakers, sandals, and slippers',
    attributes: [
      {
        name: 'Color',
        type: 'select',
        options: ['Black', 'White', 'Grey', 'Brown', 'Navy', 'Beige', 'Red']
      },
      {
        name: 'Shoe Size (EU)',
        type: 'select',
        options: ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45']
      }
    ]
  },
  {
    name: 'Accessories',
    description: 'Bags, belts, caps, socks, and jewelry',
    attributes: [
      {
        name: 'Color',
        type: 'select',
        options: ['Black', 'White', 'Brown', 'Gold', 'Silver', 'Navy', 'Multi']
      },
      {
        name: 'Material / Style',
        type: 'select',
        options: ['Leather', 'Cotton', 'Canvas', 'Stainless Steel', 'Silver Plated', 'Standard']
      }
    ]
  }
];

// Seed default categories if none exist
async function ensureDefaultCategories() {
  const count = await Category.countDocuments();
  if (count === 0) {
    for (const cat of DEFAULT_CATEGORIES) {
      await Category.create(cat);
    }
    return;
  }

  const clothing = await Category.findOne({ name: 'Clothing' }).select('subcategories').lean();
  if (clothing) {
    const cleanedSubcategories = (clothing.subcategories || []).map(value => String(value).trim()).filter(Boolean);
    const nextSubcategories = cleanedSubcategories.length ? cleanedSubcategories : ['Girl', 'Boy', 'Baby'];
    if (nextSubcategories.length !== (clothing.subcategories || []).length) {
      await Category.updateOne({ _id: clothing._id }, { $set: { subcategories: nextSubcategories } });
    }
  }
}

// GET all categories (Clothing sorted first as primary default)
router.get('/', async (req, res) => {
  try {
    await ensureDefaultCategories();
    const categories = await Category.find().lean();
    categories.sort((a, b) => {
      if (a.name.toLowerCase() === 'clothing') return -1;
      if (b.name.toLowerCase() === 'clothing') return 1;
      return a.name.localeCompare(b.name);
    });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single category
router.get('/:id', async (req, res) => {
  try {
    const cat = await Category.findById(req.params.id);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    res.json(cat);
  } catch (err) {
    res.status(400).json({ error: 'Invalid ID' });
  }
});

// POST create category
router.post('/', async (req, res) => {
  try {
    const { name, description, subcategories, attributes } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const cleanAttributes = (attributes || []).map(attr => ({
      name: attr.name?.trim() || 'Attribute',
      type: attr.type || 'select',
      options: Array.isArray(attr.options)
        ? attr.options.map(o => String(o).trim()).filter(Boolean)
        : (typeof attr.options === 'string' ? attr.options.split(',').map(s => s.trim()).filter(Boolean) : [])
    })).filter(a => a.name);

    const category = new Category({
      name: name.trim(),
      description: (description || '').trim(),
      subcategories: Array.isArray(subcategories) ? subcategories.map(value => String(value).trim()).filter(Boolean) : [],
      attributes: cleanAttributes
    });

    await category.save();
    // Create a lightweight backup for audit/restore
    try { await Backup.create({ collectionName: 'categories', operation: 'create', snapshot: category.toObject(), docIds: [String(category._id)] }) } catch (e) { console.warn('Backup create failed:', e && e.message) }
    res.status(201).json(category);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'A category with this name already exists' });
    }
    res.status(400).json({ error: err.message });
  }
});

// PUT update category
router.put('/:id', async (req, res) => {
  try {
    const { name, description, subcategories, attributes } = req.body;
    const updateData = {};
    if (name) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (subcategories !== undefined) {
      updateData.subcategories = Array.isArray(subcategories)
        ? subcategories.map(value => String(value).trim()).filter(Boolean)
        : [];
    }
    if (attributes) {
      updateData.attributes = attributes.map(attr => ({
        name: attr.name?.trim() || 'Attribute',
        type: attr.type || 'select',
        options: Array.isArray(attr.options)
          ? attr.options.map(o => String(o).trim()).filter(Boolean)
          : (typeof attr.options === 'string' ? attr.options.split(',').map(s => s.trim()).filter(Boolean) : [])
      })).filter(a => a.name);
    }

    // before update: snapshot existing doc
    const before = await Category.findById(req.params.id).lean();
    const category = await Category.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!category) return res.status(404).json({ error: 'Category not found' });
    try { await Backup.create({ collectionName: 'categories', operation: 'update', snapshot: { before, after: category.toObject() }, docIds: [String(category._id)] }) } catch (e) { console.warn('Backup update failed:', e && e.message) }
    res.json(category);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'A category with this name already exists' });
    }
    res.status(400).json({ error: err.message });
  }
});

// DELETE category
router.delete('/:id', async (req, res) => {
  try {
    // snapshot then delete
    const toDelete = await Category.findById(req.params.id).lean();
    const deleted = await Category.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Category not found' });
    try { await Backup.create({ collectionName: 'categories', operation: 'delete', snapshot: toDelete, docIds: [String(req.params.id)] }) } catch (e) { console.warn('Backup delete failed:', e && e.message) }
    res.json({ message: 'Category deleted', id: req.params.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;

// Admin endpoints to list/restore category backups (enable with ALLOW_BACKUP_ROUTES=1)
router.get('/_backups/list', async (req, res) => {
  try {
    if (process.env.ALLOW_BACKUP_ROUTES !== '1') return res.status(404).json({ error: 'Not found' })
    const Backup = require('../models/backup')
    const list = await Backup.find({ collectionName: 'categories' }).sort({ createdAt: -1 }).limit(200).lean()
    res.json(list)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/_backups/restore', async (req, res) => {
  try {
    if (process.env.ALLOW_BACKUP_ROUTES !== '1') return res.status(404).json({ error: 'Not found' })
    const { id } = req.body
    if (!id) return res.status(400).json({ error: 'id required' })
    const Backup = require('../models/backup')
    const b = await Backup.findById(id).lean()
    if (!b) return res.status(404).json({ error: 'backup not found' })
    if (b.collectionName !== 'categories') return res.status(400).json({ error: 'invalid collection for this route' })
    const snapshot = b.snapshot
    if (!snapshot || !snapshot._id) return res.status(400).json({ error: 'invalid snapshot' })
    const existing = await Category.findById(snapshot._id)
    if (existing) {
      Object.assign(existing, snapshot)
      await existing.save()
      return res.json({ restored: true, id: existing._id })
    } else {
      const nc = new Category(snapshot)
      await nc.save()
      return res.json({ restored: true, id: nc._id })
    }
  } catch (err) { res.status(500).json({ error: err.message }) }
})
