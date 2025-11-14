# How to Add an Admin User

There are **three ways** to add an admin user to the system:

## Method 1: Using the API Endpoint (Recommended)

### Prerequisites
- You need to have at least one existing admin account to authenticate
- Backend server must be running

### Steps

1. **Login as an existing admin** to get a JWT token:
```bash
POST http://localhost:4000/api/v1/admin/signin
Content-Type: application/json

{
  "email": "existing-admin@example.com",
  "password": "existing-password"
}
```

2. **Create a new admin** using the token:
```bash
POST http://localhost:4000/api/v1/admin/create
Content-Type: application/json
Authorization: <your-jwt-token>

{
  "email": "new-admin@example.com",
  "password": "secure-password-123",
  "role": "admin",
  "status": "active"
}
```

**Request Body Parameters:**
- `email` (required): Admin email address (must be unique)
- `password` (required): Admin password (will be hashed automatically)
- `role` (optional): Admin role (default: "admin")
- `status` (optional): Account status (default: "active")

**Response:**
```json
{
  "code": 200,
  "data": {
    "id": 2,
    "email": "new-admin@example.com",
    "role": "admin",
    "status": "active"
  },
  "message": "Admin created successfully"
}
```

---

## Method 2: Direct Database Insert (For First Admin)

If you don't have any admin yet, you can create the first admin directly in the database.

### Steps

1. **Connect to your PostgreSQL database**

2. **Hash the password** using Node.js:
```javascript
const bcrypt = require('bcrypt');
const password = 'your-secure-password';
const hash = await bcrypt.hash(password, 10);
console.log(hash); // Copy this hashed password
```

Or use this one-liner in Node.js:
```bash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('your-password', 10).then(h => console.log(h))"
```

3. **Insert admin into database**:
```sql
INSERT INTO "Admins" (email, password, role, status)
VALUES (
  'admin@example.com',
  '$2b$10$hashed_password_here',  -- Replace with hashed password from step 2
  'admin',
  'active'
);
```

**Example:**
```sql
INSERT INTO "Admins" (email, password, role, status)
VALUES (
  'admin@ok777.com',
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  'admin',
  'active'
);
```

---

## Method 3: Using Prisma Studio or Script

### Using Prisma Studio

1. **Open Prisma Studio**:
```bash
cd ok777-backend
npx prisma studio
```

2. Navigate to the `Admins` table
3. Click "Add record"
4. Fill in the fields:
   - `email`: admin email
   - `password`: **You need to hash it first** (use Method 2, step 2)
   - `role`: "admin"
   - `status`: "active"
5. Save the record

### Using a Script

Create a file `create-admin.js` in the `ok777-backend` directory:

```javascript
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function createAdmin() {
  const email = process.argv[2] || 'admin@example.com';
  const password = process.argv[3] || 'admin123';
  const role = process.argv[4] || 'admin';
  const status = process.argv[5] || 'active';

  try {
    // Check if admin exists
    const existing = await prisma.admin.findUnique({ where: { email } });
    if (existing) {
      console.error('Admin with this email already exists!');
      process.exit(1);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin
    const admin = await prisma.admin.create({
      data: {
        email,
        password: hashedPassword,
        role,
        status,
      },
    });

    console.log('Admin created successfully!');
    console.log('ID:', admin.id);
    console.log('Email:', admin.email);
    console.log('Role:', admin.role);
    console.log('Status:', admin.status);
  } catch (error) {
    console.error('Error creating admin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
```

**Run the script:**
```bash
cd ok777-backend
node create-admin.js admin@example.com secure-password admin active
```

---

## Verification

After creating an admin, verify it works by logging in:

```bash
POST http://localhost:4000/api/v1/admin/signin
Content-Type: application/json

{
  "email": "new-admin@example.com",
  "password": "secure-password-123"
}
```

You should receive a JWT token if the admin was created successfully.

---

## Important Notes

1. **Password Security**: Passwords are automatically hashed using bcrypt (10 rounds) when using the API endpoint
2. **Email Uniqueness**: Each admin email must be unique
3. **First Admin**: If you don't have any admin, use Method 2 or Method 3
4. **Role Options**: Common roles are "admin", "super_admin", "moderator"
5. **Status Options**: Common statuses are "active", "suspended", "inactive"

---

## Troubleshooting

### Error: "Admin with this email already exists"
- The email is already in use
- Use a different email address

### Error: "User not found" when logging in
- Check that the admin was created successfully
- Verify the email is correct
- Check database connection

### Error: "Not correct password"
- Verify the password is correct
- If using direct database insert, ensure password is properly hashed

---

## Security Best Practices

1. **Use strong passwords**: Minimum 12 characters, mix of letters, numbers, and symbols
2. **Don't share admin credentials**: Each admin should have their own account
3. **Regularly rotate passwords**: Change admin passwords periodically
4. **Monitor admin activity**: Check logs regularly for suspicious activity
5. **Limit admin creation**: Only allow trusted administrators to create new admins

