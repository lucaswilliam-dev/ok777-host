const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
require('dotenv').config();

const prisma = new PrismaClient();

async function createAdmin() {
  const email = process.argv[2];
  const password = process.argv[3];
  const role = process.argv[4] || 'admin';
  const status = process.argv[5] || 'active';

  if (!email || !password) {
    console.error('Usage: node create-admin.js <email> <password> [role] [status]');
    console.error('Example: node create-admin.js admin@example.com secure-password admin active');
    process.exit(1);
  }

  try {
    // Check if admin exists
    const existing = await prisma.admin.findUnique({ where: { email } });
    if (existing) {
      console.error('❌ Admin with this email already exists!');
      console.error(`   Email: ${email}`);
      console.error(`   ID: ${existing.id}`);
      process.exit(1);
    }

    // Hash password
    console.log('🔐 Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin
    console.log('👤 Creating admin...');
    const admin = await prisma.admin.create({
      data: {
        email,
        password: hashedPassword,
        role,
        status,
      },
    });

    console.log('\n✅ Admin created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   ID:     ${admin.id}`);
    console.log(`   Email:  ${admin.email}`);
    console.log(`   Role:   ${admin.role}`);
    console.log(`   Status: ${admin.status}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n💡 You can now login with this admin account.');
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();

