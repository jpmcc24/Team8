require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendVerificationEmail } = require('./public/js/mailer');

const app = express();
const port = 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the "public" folder
app.use(express.static('public'));

//////////////////////////////////////
//ROUTES TO SERVE HTML FILES
//////////////////////////////////////
// Default route to serve logon.html
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/logon.html');
});

// Route to serve dashboard.html
app.get('/dashboard', (req, res) => {
    res.sendFile(__dirname + '/public/dashboard.html');
});

// Route to serve account.html
app.get('/account', (req, res) => {
    res.sendFile(__dirname + '/public/account.html');
});
//////////////////////////////////////
//END ROUTES TO SERVE HTML FILES
//////////////////////////////////////


/////////////////////////////////////////////////
//HELPER FUNCTIONS AND AUTHENTICATION MIDDLEWARE
/////////////////////////////////////////////////
// Helper function to create a MySQL connection
async function createConnection() {
    return await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
}

// **Authorization Middleware: Verify JWT Token and Check User in Database**
async function authenticateToken(req, res, next) {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid token.' });
        }

        try {
            const connection = await createConnection();

            // Query the database to verify that the email is associated with an active account
            const [rows] = await connection.execute(
                'SELECT email FROM user WHERE email = ?',
                [decoded.email]
            );

            await connection.end();  // Close connection

            if (rows.length === 0) {
                return res.status(403).json({ message: 'Account not found or deactivated.' });
            }

            req.user = decoded;  // Save the decoded email for use in the route
            next();  // Proceed to the next middleware or route handler
        } catch (dbError) {
            console.error(dbError);
            res.status(500).json({ message: 'Database error during authentication.' });
        }
    });
}
/////////////////////////////////////////////////
//END HELPER FUNCTIONS AND AUTHENTICATION MIDDLEWARE
/////////////////////////////////////////////////


//////////////////////////////////////
//ROUTES TO HANDLE API REQUESTS
//////////////////////////////////////
// Route: Create Account
app.post('/api/create-account', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    try {
        const connection = await createConnection();
        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationToken = crypto.randomBytes(32).toString('hex');

        await connection.execute(
            'INSERT INTO user (email, password, verification_token) VALUES (?, ?, ?)',
            [email, hashedPassword, verificationToken]
        );

        await connection.end();

        // Send email non-blocking — don't fail registration if mail fails
        sendVerificationEmail(email, verificationToken).catch(err =>
            console.error('Verification email failed:', err)
        );

        res.status(201).json({ message: 'Account created! Please check your email to verify.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ message: 'An account with this email already exists.' });
        } else {
            console.error(error);
            res.status(500).json({ message: 'Error creating account.' });
        }
    }
});

app.get('/api/auth/verify-email', async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).send('Missing token.');

    try {
        const connection = await createConnection();
        const [rows] = await connection.execute(
            'SELECT email FROM user WHERE verification_token = ?',
            [token]
        );

        if (rows.length === 0) {
            await connection.end();
            return res.status(400).send('Invalid or expired verification link.');
        }

        await connection.execute(
            'UPDATE user SET email_verified = 1, verification_token = NULL WHERE verification_token = ?',
            [token]
        );

        await connection.end();
        res.redirect('/?verified=1');
    } catch (error) {
        console.error(error);
        res.status(500).send('Verification failed. Please try again.');
    }
});

app.post('/api/auth/resend-verification', authenticateToken, async (req, res) => {
    try {
        const token = crypto.randomBytes(32).toString('hex');
        const connection = await createConnection();

        await connection.execute(
            'UPDATE user SET verification_token = ? WHERE email = ?',
            [token, req.user.email]
        );

        await connection.end();

        await sendVerificationEmail(req.user.email, token);
        res.status(200).json({ message: 'Verification email sent.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error sending verification email.' });
    }
});

// Route: Logon
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    try {
        const connection = await createConnection();

        const [rows] = await connection.execute(
            'SELECT * FROM user WHERE email = ?',
            [email]
        );

        await connection.end();  // Close connection

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        const user = rows[0];

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        const token = jwt.sign(
            { email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(200).json({ token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error logging in.' });
    }
});

// Route: Get All Email Addresses
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();

        const [rows] = await connection.execute('SELECT email FROM user');

        await connection.end();  // Close connection

        const emailList = rows.map((row) => row.email);
        res.status(200).json({ emails: emailList });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving email addresses.' });
    }
});

// Route: Get current profile
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [rows] = await connection.execute(
            'SELECT email, email_verified FROM user WHERE email = ?',
            [req.user.email]
        );
        await connection.end();
        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        res.status(200).json({ email: rows[0].email, email_verified: !!rows[0].email_verified });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving profile.' });
    }
});

// Route: Update email address
app.put('/api/account/email', authenticateToken, async (req, res) => {
    const { newEmail, currentPassword } = req.body;

    if (!newEmail || !currentPassword) {
        return res.status(400).json({ message: 'New email and current password are required.' });
    }

    if (newEmail === req.user.email) {
        return res.status(400).json({ message: 'Enter a different email address.' });
    }

    let connection;
    try {
        connection = await createConnection();
        await connection.beginTransaction();

        const [userRows] = await connection.execute(
            'SELECT password FROM user WHERE email = ?',
            [req.user.email]
        );

        if (userRows.length === 0) {
            await connection.rollback();
            await connection.end();
            return res.status(404).json({ message: 'User not found.' });
        }

        const passwordMatch = await bcrypt.compare(currentPassword, userRows[0].password);
        if (!passwordMatch) {
            await connection.rollback();
            await connection.end();
            return res.status(401).json({ message: 'Current password is incorrect.' });
        }

        const [existingRows] = await connection.execute(
            'SELECT email FROM user WHERE email = ?',
            [newEmail]
        );
        if (existingRows.length > 0) {
            await connection.rollback();
            await connection.end();
            return res.status(409).json({ message: 'An account with that email already exists.' });
        }

        await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
        await connection.execute(
            'UPDATE vehicles SET user_email = ? WHERE user_email = ?',
            [newEmail, req.user.email]
        );
        await connection.execute(
            'UPDATE user SET email = ? WHERE email = ?',
            [newEmail, req.user.email]
        );
        await connection.execute('SET FOREIGN_KEY_CHECKS = 1');

        await connection.commit();
        await connection.end();

        const token = jwt.sign(
            { email: newEmail },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(200).json({ message: 'Email updated successfully.', token });
    } catch (error) {
        console.error(error);
        try {
            if (connection) await connection.rollback();
        } catch (rollbackError) {
            console.error('Error rolling back transaction:', rollbackError);
        }
        if (connection) await connection.end();
        res.status(500).json({ message: 'Error updating email address.' });
    }
});

// Route: Update password
app.put('/api/account/password', authenticateToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Current password and new password are required.' });
    }

    try {
        const connection = await createConnection();
        const [rows] = await connection.execute(
            'SELECT password FROM user WHERE email = ?',
            [req.user.email]
        );

        if (rows.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'User not found.' });
        }

        const passwordMatch = await bcrypt.compare(currentPassword, rows[0].password);
        if (!passwordMatch) {
            await connection.end();
            return res.status(401).json({ message: 'Current password is incorrect.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await connection.execute(
            'UPDATE user SET password = ? WHERE email = ?',
            [hashedPassword, req.user.email]
        );
        await connection.end();

        res.status(200).json({ message: 'Password updated successfully.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating password.' });
    }
});


//////////////////////////////////////
// VEHICLE ROUTES
//////////////////////////////////////
// Route: Get all vehicles for the logged-in user
app.get('/api/vehicles', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [rows] = await connection.execute(
            'SELECT * FROM vehicles WHERE user_email = ? ORDER BY created_at ASC',
            [req.user.email]
        );
        await connection.end();
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving vehicles.' });
    }
});

// Route: Add a vehicle
app.post('/api/vehicles', authenticateToken, async (req, res) => {
    const { year, make, model, type, current_mileage } = req.body;
    if (!year || !make || !model) {
        return res.status(400).json({ message: 'Year, make, and model are required.' });
    }
    try {
        const connection = await createConnection();
        const [result] = await connection.execute(
            'INSERT INTO vehicles (user_email, year, make, model, type, current_mileage) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.email, year, make, model, type || 'Other', current_mileage || 0]
        );
        const [rows] = await connection.execute('SELECT * FROM vehicles WHERE id = ?', [result.insertId]);
        await connection.end();
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error adding vehicle.' });
    }
});

// Route: Update a vehicle
app.put('/api/vehicles/:id', authenticateToken, async (req, res) => {
    const { year, make, model, type, current_mileage } = req.body;
    if (!year || !make || !model) {
        return res.status(400).json({ message: 'Year, make, and model are required.' });
    }
    try {
        const connection = await createConnection();
        const [result] = await connection.execute(
            'UPDATE vehicles SET year = ?, make = ?, model = ?, type = ?, current_mileage = ? WHERE id = ? AND user_email = ?',
            [year, make, model, type || 'Other', current_mileage || 0, req.params.id, req.user.email]
        );
        await connection.end();
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Vehicle not found.' });
        }
        res.status(200).json({ id: req.params.id, year, make, model, type, current_mileage });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating vehicle.' });
    }
});

// Route: Delete a vehicle
app.delete('/api/vehicles/:id', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        await connection.execute('DELETE FROM maintenance_log WHERE vehicle_id = ?', [req.params.id]);
        await connection.execute('DELETE FROM fuel_log WHERE vehicle_id = ?', [req.params.id]);
        await connection.execute('DELETE FROM reminders WHERE vehicle_id = ?', [req.params.id]);
        await connection.execute('DELETE FROM maintenance_rules WHERE vehicle_id = ?', [req.params.id]);
        const [result] = await connection.execute(
            'DELETE FROM vehicles WHERE id = ? AND user_email = ?',
            [req.params.id, req.user.email]
        );
        await connection.end();
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Vehicle not found.' });
        }
        res.status(200).json({ message: 'Vehicle deleted.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error deleting vehicle.' });
    }
});

//////////////////////////////////////
// MAINTENANCE LOG ROUTES
//////////////////////////////////////
// Route: Get all maintenance records for the logged-in user
app.get('/api/maintenance', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [rows] = await connection.execute(
            `SELECT m.* FROM maintenance_log m
             JOIN vehicles v ON m.vehicle_id = v.id
             WHERE v.user_email = ?
             ORDER BY m.date DESC, m.created_at DESC`,
            [req.user.email]
        );
        await connection.end();
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving maintenance log.' });
    }
});

// Route: Add a maintenance record
app.post('/api/maintenance', authenticateToken, async (req, res) => {
    const { vehicle_id, service_type, date, mileage, cost, location, notes } = req.body;
    if (!vehicle_id || !service_type || !date) {
        return res.status(400).json({ message: 'vehicle_id, service_type, and date are required.' });
    }
    try {
        const connection = await createConnection();
        // Verify the vehicle belongs to this user
        const [vehicles] = await connection.execute(
            'SELECT id FROM vehicles WHERE id = ? AND user_email = ?',
            [vehicle_id, req.user.email]
        );
        if (vehicles.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'Vehicle not found.' });
        }
        const [result] = await connection.execute(
            'INSERT INTO maintenance_log (vehicle_id, service_type, date, mileage, cost, location, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [vehicle_id, service_type, date, mileage || 0, cost || 0, location || '', notes || '']
        );
        if (mileage > 0) {
            await connection.execute(
                'UPDATE vehicles SET current_mileage = ? WHERE id = ? AND current_mileage < ?',
                [mileage, vehicle_id, mileage]
            );
        }
        await connection.end();
        res.status(201).json({ id: result.insertId, vehicle_id, service_type, date, mileage, cost, location, notes });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error adding maintenance entry.' });
    }
});

// Route: Update a maintenance record
app.put('/api/maintenance/:id', authenticateToken, async (req, res) => {
    const { service_type, date, mileage, cost, location, notes } = req.body;
    if (!service_type || !date) {
        return res.status(400).json({ message: 'service_type and date are required.' });
    }
    try {
        const connection = await createConnection();
        const [result] = await connection.execute(
            `UPDATE maintenance_log m
             JOIN vehicles v ON m.vehicle_id = v.id
             SET m.service_type = ?, m.date = ?, m.mileage = ?, m.cost = ?, m.location = ?, m.notes = ?
             WHERE m.id = ? AND v.user_email = ?`,
            [service_type, date, mileage || 0, cost || 0, location || '', notes || '', req.params.id, req.user.email]
        );
        await connection.end();
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Maintenance record not found.' });
        }
        res.status(200).json({ id: req.params.id, service_type, date, mileage, cost, location, notes });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating maintenance record.' });
    }
});

// Route: Delete a maintenance record
app.delete('/api/maintenance/:id', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [result] = await connection.execute(
            `DELETE m FROM maintenance_log m
             JOIN vehicles v ON m.vehicle_id = v.id
             WHERE m.id = ? AND v.user_email = ?`,
            [req.params.id, req.user.email]
        );
        await connection.end();
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Maintenance record not found.' });
        }
        res.status(200).json({ message: 'Maintenance record deleted.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error deleting maintenance record.' });
    }
});

//////////////////////////////////////
// FUEL LOG ROUTES
//////////////////////////////////////
app.get('/api/fuel', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [rows] = await connection.execute(
            `SELECT f.* FROM fuel_log f
             JOIN vehicles v ON f.vehicle_id = v.id
             WHERE v.user_email = ?
             ORDER BY f.date DESC, f.created_at DESC`,
            [req.user.email]
        );
        await connection.end();
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving fuel log.' });
    }
});

app.post('/api/fuel', authenticateToken, async (req, res) => {
    const { vehicle_id, date, gallons, price_per_gallon, mileage, station } = req.body;
    if (!vehicle_id || !date || !gallons) {
        return res.status(400).json({ message: 'vehicle_id, date, and gallons are required.' });
    }
    try {
        const connection = await createConnection();
        const [vehicles] = await connection.execute(
            'SELECT id FROM vehicles WHERE id = ? AND user_email = ?',
            [vehicle_id, req.user.email]
        );
        if (vehicles.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'Vehicle not found.' });
        }
        const [result] = await connection.execute(
            'INSERT INTO fuel_log (vehicle_id, date, gallons, price_per_gallon, mileage, station) VALUES (?, ?, ?, ?, ?, ?)',
            [vehicle_id, date, gallons, price_per_gallon || 0, mileage || 0, station || '']
        );
        if (mileage > 0) {
            await connection.execute(
                'UPDATE vehicles SET current_mileage = ? WHERE id = ? AND current_mileage < ?',
                [mileage, vehicle_id, mileage]
            );
        }
        await connection.end();
        res.status(201).json({ id: result.insertId, vehicle_id, date, gallons, price_per_gallon, mileage, station });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error adding fuel entry.' });
    }
});

// Route: Update a fuel entry
app.put('/api/fuel/:id', authenticateToken, async (req, res) => {
    const { date, gallons, price_per_gallon, mileage, station } = req.body;
    if (!date || !gallons) {
        return res.status(400).json({ message: 'date and gallons are required.' });
    }
    try {
        const connection = await createConnection();
        const [result] = await connection.execute(
            `UPDATE fuel_log f
             JOIN vehicles v ON f.vehicle_id = v.id
             SET f.date = ?, f.gallons = ?, f.price_per_gallon = ?, f.mileage = ?, f.station = ?
             WHERE f.id = ? AND v.user_email = ?`,
            [date, gallons, price_per_gallon || 0, mileage || 0, station || '', req.params.id, req.user.email]
        );
        await connection.end();
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Fuel entry not found.' });
        }
        res.status(200).json({ id: req.params.id, date, gallons, price_per_gallon, mileage });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating fuel entry.' });
    }
});

// Route: Delete a fuel entry
app.delete('/api/fuel/:id', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [result] = await connection.execute(
            `DELETE f FROM fuel_log f
             JOIN vehicles v ON f.vehicle_id = v.id
             WHERE f.id = ? AND v.user_email = ?`,
            [req.params.id, req.user.email]
        );
        await connection.end();
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Fuel entry not found.' });
        }
        res.status(200).json({ message: 'Fuel entry deleted.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error deleting fuel entry.' });
    }
});

//////////////////////////////////////
// REMINDERS ROUTES
//////////////////////////////////////
app.get('/api/reminders', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [rows] = await connection.execute(
            `SELECT r.* FROM reminders r
             JOIN vehicles v ON r.vehicle_id = v.id
             WHERE v.user_email = ? AND r.completed = 0
             ORDER BY r.due_date ASC`,
            [req.user.email]
        );
        await connection.end();
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving reminders.' });
    }
});

app.post('/api/reminders', authenticateToken, async (req, res) => {
    const { vehicle_id, service_type, due_date, due_mileage } = req.body;
    if (!vehicle_id || !service_type) {
        return res.status(400).json({ message: 'vehicle_id and service_type are required.' });
    }
    try {
        const connection = await createConnection();
        const [vehicles] = await connection.execute(
            'SELECT id FROM vehicles WHERE id = ? AND user_email = ?',
            [vehicle_id, req.user.email]
        );
        if (vehicles.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'Vehicle not found.' });
        }
        const [result] = await connection.execute(
            'INSERT INTO reminders (vehicle_id, service_type, due_date, due_mileage, completed) VALUES (?, ?, ?, ?, 0)',
            [vehicle_id, service_type, due_date || null, due_mileage || null]
        );
        await connection.end();
        res.status(201).json({ id: result.insertId, vehicle_id, service_type, due_date, due_mileage, completed: 0 });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error adding reminder.' });
    }
});

app.put('/api/reminders/:id/complete', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [result] = await connection.execute(
            `UPDATE reminders r
             JOIN vehicles v ON r.vehicle_id = v.id
             SET r.completed = 1
             WHERE r.id = ? AND v.user_email = ?`,
            [req.params.id, req.user.email]
        );
        await connection.end();
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Reminder not found.' });
        }
        res.status(200).json({ message: 'Reminder marked complete.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error completing reminder.' });
    }
});

//////////////////////////////////////
// MAINTENANCE RULES ROUTES
//////////////////////////////////////
app.get('/api/rules', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [rows] = await connection.execute(
            `SELECT r.* FROM maintenance_rules r
             JOIN vehicles v ON r.vehicle_id = v.id
             WHERE v.user_email = ?
             ORDER BY r.created_at ASC`,
            [req.user.email]
        );
        await connection.end();
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving maintenance rules.' });
    }
});

app.post('/api/rules', authenticateToken, async (req, res) => {
    const { vehicle_id, service_type, interval_days, interval_miles, last_done_date, last_done_mileage } = req.body;
    if (!vehicle_id || !service_type) {
        return res.status(400).json({ message: 'vehicle_id and service_type are required.' });
    }
    if (!interval_days && !interval_miles) {
        return res.status(400).json({ message: 'At least one of interval_days or interval_miles is required.' });
    }
    try {
        const connection = await createConnection();
        const [vehicles] = await connection.execute(
            'SELECT id FROM vehicles WHERE id = ? AND user_email = ?',
            [vehicle_id, req.user.email]
        );
        if (vehicles.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'Vehicle not found.' });
        }
        const [result] = await connection.execute(
            'INSERT INTO maintenance_rules (vehicle_id, service_type, interval_days, interval_miles, last_done_date, last_done_mileage) VALUES (?, ?, ?, ?, ?, ?)',
            [vehicle_id, service_type, interval_days || null, interval_miles || null, last_done_date || null, last_done_mileage || null]
        );
        const [rows] = await connection.execute('SELECT * FROM maintenance_rules WHERE id = ?', [result.insertId]);
        await connection.end();
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error creating maintenance rule.' });
    }
});

app.put('/api/rules/:id', authenticateToken, async (req, res) => {
    const { service_type, interval_days, interval_miles, last_done_date, last_done_mileage } = req.body;
    if (!service_type) {
        return res.status(400).json({ message: 'service_type is required.' });
    }
    if (!interval_days && !interval_miles) {
        return res.status(400).json({ message: 'At least one interval is required.' });
    }
    try {
        const connection = await createConnection();
        const [result] = await connection.execute(
            `UPDATE maintenance_rules r
             JOIN vehicles v ON r.vehicle_id = v.id
             SET r.service_type = ?, r.interval_days = ?, r.interval_miles = ?, r.last_done_date = ?, r.last_done_mileage = ?
             WHERE r.id = ? AND v.user_email = ?`,
            [service_type, interval_days || null, interval_miles || null, last_done_date || null, last_done_mileage || null, req.params.id, req.user.email]
        );
        await connection.end();
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Rule not found.' });
        }
        res.status(200).json({ id: req.params.id, service_type, interval_days, interval_miles, last_done_date, last_done_mileage });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating rule.' });
    }
});

app.put('/api/rules/:id/complete', authenticateToken, async (req, res) => {
    const { last_done_date, last_done_mileage } = req.body;
    try {
        const connection = await createConnection();
        const [result] = await connection.execute(
            `UPDATE maintenance_rules r
             JOIN vehicles v ON r.vehicle_id = v.id
             SET r.last_done_date = ?, r.last_done_mileage = ?
             WHERE r.id = ? AND v.user_email = ?`,
            [last_done_date || null, last_done_mileage || null, req.params.id, req.user.email]
        );
        await connection.end();
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Rule not found.' });
        }
        res.status(200).json({ message: 'Rule updated.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating maintenance rule.' });
    }
});

app.delete('/api/rules/:id', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [result] = await connection.execute(
            `DELETE r FROM maintenance_rules r
             JOIN vehicles v ON r.vehicle_id = v.id
             WHERE r.id = ? AND v.user_email = ?`,
            [req.params.id, req.user.email]
        );
        await connection.end();
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Rule not found.' });
        }
        res.status(200).json({ message: 'Rule deleted.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error deleting maintenance rule.' });
    }
});

//////////////////////////////////////
// ACCOUNT ROUTES
//////////////////////////////////////
// Route: Delete Account
app.delete('/api/account', authenticateToken, async (req, res) => {
    const email = req.user.email;
    try {
        const connection = await createConnection();
        await connection.execute(
            `DELETE ml FROM maintenance_log ml JOIN vehicles v ON ml.vehicle_id = v.id WHERE v.user_email = ?`,
            [email]
        );
        await connection.execute(
            `DELETE fl FROM fuel_log fl JOIN vehicles v ON fl.vehicle_id = v.id WHERE v.user_email = ?`,
            [email]
        );
        await connection.execute(
            `DELETE r FROM reminders r JOIN vehicles v ON r.vehicle_id = v.id WHERE v.user_email = ?`,
            [email]
        );
        await connection.execute(
            `DELETE mr FROM maintenance_rules mr JOIN vehicles v ON mr.vehicle_id = v.id WHERE v.user_email = ?`,
            [email]
        );
        await connection.execute('DELETE FROM vehicles WHERE user_email = ?', [email]);
        await connection.execute('DELETE FROM user WHERE email = ?', [email]);
        await connection.end();
        res.status(200).json({ message: 'Account deleted.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error deleting account.' });
    }
});
//////////////////////////////////////
//END ROUTES TO HANDLE API REQUESTS
//////////////////////////////////////


// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});