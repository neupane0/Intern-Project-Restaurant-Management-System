# Customer Reservation Feature

This document describes the new customer reservation functionality added to the Restaurant Management System.

## Overview

The customer reservation feature allows customers to:
- Create their own reservations
- View and manage their reservations
- Cancel their reservations
- Check table availability

All customer reservations require admin approval before being confirmed.

## User Roles

### Customer Role
- **Role**: `customer`
- **Permissions**: Can manage their own reservations
- **Default**: New registrations default to customer role

### Admin Role
- **Role**: `admin`
- **Permissions**: Can approve/reject customer reservations, manage all reservations

## Database Schema Changes

### User Model Updates
- Added `customer` to the role enum
- Changed default role to `customer`

### Reservation Model Updates
- Added `isCustomerReservation` (Boolean) - identifies customer-made reservations
- Added `approvedBy` (ObjectId) - references the admin who approved the reservation
- Added `approvedAt` (Date) - timestamp when reservation was approved

## API Endpoints

### Customer Reservation Endpoints

#### 1. Create Customer Reservation
```
POST /api/customer/reservations
Authorization: Bearer <customer_token>
Content-Type: application/json

{
  "tableNumber": "T-1",
  "customerName": "John Doe",
  "customerPhoneNumber": "+1234567890",
  "numberOfGuests": 4,
  "reservationTime": "2024-01-15T19:00:00.000Z",
  "notes": "Window seat preferred"
}
```

**Response:**
```json
{
  "_id": "reservation_id",
  "tableNumber": "T-1",
  "customerName": "John Doe",
  "customerPhoneNumber": "+1234567890",
  "numberOfGuests": 4,
  "reservationTime": "2024-01-15T19:00:00.000Z",
  "status": "pending",
  "isCustomerReservation": true,
  "message": "Reservation created successfully. It will be reviewed by admin and you will be notified once approved."
}
```

#### 2. Get Customer's Reservations
```
GET /api/customer/reservations?status=pending
Authorization: Bearer <customer_token>
```

#### 3. Get Single Customer Reservation
```
GET /api/customer/reservations/:id
Authorization: Bearer <customer_token>
```

#### 4. Update Customer Reservation
```
PUT /api/customer/reservations/:id
Authorization: Bearer <customer_token>
Content-Type: application/json

{
  "tableNumber": "T-2",
  "numberOfGuests": 6,
  "notes": "Updated notes"
}
```

**Note**: Only pending reservations can be updated.

#### 5. Cancel Customer Reservation
```
DELETE /api/customer/reservations/:id
Authorization: Bearer <customer_token>
```

**Note**: Only pending or confirmed reservations can be cancelled.

#### 6. Check Available Tables
```
GET /api/customer/reservations/available?reservationTime=2024-01-15T19:00:00.000Z
Authorization: Bearer <customer_token>
```

### Admin Approval Endpoints

#### 1. Get Pending Customer Reservations
```
GET /api/reservations/pending-customer
Authorization: Bearer <admin_token>
```

#### 2. Approve/Reject Customer Reservation
```
PUT /api/reservations/:id/approve
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "action": "approve"  // or "reject"
}
```

## Workflow

### Customer Reservation Flow
1. Customer registers/logs in
2. Customer checks available tables
3. Customer creates reservation (status: pending)
4. Admin receives notification of pending reservation
5. Admin reviews and approves/rejects reservation
6. Customer receives notification of approval/rejection
7. Customer can manage their reservation (update/cancel)

### Admin Approval Flow
1. Admin views pending customer reservations
2. Admin reviews reservation details
3. Admin approves or rejects the reservation
4. System automatically sends notification to customer
5. Reservation status is updated accordingly

## Features

### Customer Features
- ✅ Create reservations
- ✅ View own reservations
- ✅ Update pending reservations
- ✅ Cancel reservations
- ✅ Check table availability
- ✅ Receive approval notifications

### Admin Features
- ✅ View all pending customer reservations
- ✅ Approve customer reservations
- ✅ Reject customer reservations
- ✅ Send approval notifications
- ✅ Manage all reservations (existing functionality)

### Security Features
- ✅ Role-based access control
- ✅ Customers can only manage their own reservations
- ✅ Admin approval required for customer reservations
- ✅ Input validation and conflict checking
- ✅ WhatsApp notifications for approvals

## Testing

Run the test script to verify functionality:

```bash
node test-customer-reservation.js
```

This script demonstrates the complete customer reservation workflow.

## File Structure

```
├── models/
│   ├── User.js (updated)
│   └── Reservation.js (updated)
├── controllers/
│   ├── reservationController.js (updated)
│   └── customerReservationController.js (new)
├── routes/
│   ├── reservationRoutes.js (updated)
│   └── customerReservationRoutes.js (new)
├── app.js (updated)
├── test-customer-reservation.js (new)
└── CUSTOMER_RESERVATION_FEATURE.md (this file)
```

## Environment Variables

Ensure these environment variables are set:
- `JWT_SECRET` - for authentication
- WhatsApp service configuration (if using notifications)

## Notes

- Customer reservations start with `status: 'pending'`
- Admin/waiter reservations are automatically `status: 'confirmed'`
- Only pending reservations can be updated by customers
- WhatsApp notifications are sent when reservations are approved
- Table conflict checking prevents double bookings
- All customer operations require authentication and customer role 