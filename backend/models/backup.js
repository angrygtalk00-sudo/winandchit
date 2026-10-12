const mongoose = require('mongoose')
const { Schema } = mongoose

const BackupSchema = new Schema({
  collectionName: { type: String, required: true },
  operation: { type: String, required: true },
  snapshot: { type: Schema.Types.Mixed },
  docIds: { type: [String], default: [] },
  meta: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
})

module.exports = mongoose.model('Backup', BackupSchema)
