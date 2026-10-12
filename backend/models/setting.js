const mongoose = require('mongoose');

const bankAccountSchema = new mongoose.Schema({
  bankName: { type: String, default: '' },
  accountName: { type: String, default: '' },
  accountNumber: { type: String, default: '' },
  logoUrl: { type: String, default: '' },
  bgColor: { type: String, default: '#1e293b' },
  textColor: { type: String, default: '#ffffff' },
  enabled: { type: Boolean, default: true }
}, { _id: true });

const deliveryServiceSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  logoUrl: { type: String, default: '' },
  bgColor: { type: String, default: '#1e293b' },
  enabled: { type: Boolean, default: true }
}, { _id: true });

const bannerMediaSchema = new mongoose.Schema({
  url: { type: String, default: '' },
  enabled: { type: Boolean, default: true }
}, { _id: true });

const settingSchema = new mongoose.Schema({
  key: { type: String, default: 'global', unique: true },
  sender: {
    shopName: { type: String, default: 'Win & Chit' },
    phone: { type: String, default: '09-123456789' },
    address: { type: String, default: 'Yangon, Myanmar' },
    city: { type: String, default: 'Yangon' },
    tagline: { type: String, default: 'Clothing Retail' },
    note: { type: String, default: 'Thank you for shopping with Win & Chit!' }
  },
  bankAccounts: {
    type: [bankAccountSchema],
    default: [
      {
        bankName: 'KBZPay (KPay)',
        accountName: 'Win & Chit',
        accountNumber: '09-123456789',
        bgColor: '#003b82',
        textColor: '#ffffff',
        logoUrl: '',
        enabled: true
      },
      {
        bankName: 'WavePay',
        accountName: 'Win & Chit',
        accountNumber: '09-123456789',
        bgColor: '#ffc800',
        textColor: '#1a1a1a',
        logoUrl: '',
        enabled: true
      },
      {
        bankName: 'CB Pay',
        accountName: 'Win & Chit',
        accountNumber: '0012-3456-7890',
        bgColor: '#ce0e2d',
        textColor: '#ffffff',
        logoUrl: '',
        enabled: true
      },
      {
        bankName: 'AYA Pay',
        accountName: 'Win & Chit',
        accountNumber: '0098-7654-3210',
        bgColor: '#b81c22',
        textColor: '#ffffff',
        logoUrl: '',
        enabled: true
      }
    ]
  },
  deliveryServices: {
    type: [deliveryServiceSchema],
    default: []
  },
  banners: {
    type: [bannerMediaSchema],
    default: []
  }
}, { timestamps: true });

// Static helper to get or initialize default settings
settingSchema.statics.getOrCreate = async function() {
  let settings = await this.findOne({ key: 'global' });
  if (!settings) {
    settings = await this.create({ key: 'global' });
  }
  return settings;
};

module.exports = mongoose.model('Setting', settingSchema);
