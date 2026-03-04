require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

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
        const hashedPassword = await bcrypt.hash(password, 10);  // Hash password

        const [result] = await connection.execute(
            'INSERT INTO user (email, password) VALUES (?, ?)',
            [email, hashedPassword]
        );

        await connection.end();  // Close connection

        res.status(201).json({ message: 'Account created successfully!' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ message: 'An account with this email already exists.' });
        } else {
            console.error(error);
            res.status(500).json({ message: 'Error creating account.' });
        }
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
        await connection.execute(
            'DELETE FROM maintenance_log WHERE vehicle_id = ?',
            [req.params.id]
        );
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
        await connection.end();
        res.status(201).json({ id: result.insertId, vehicle_id, service_type, date, mileage, cost, location, notes });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error adding maintenance entry.' });
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
            'INSERT INTO fuel_log (vehicle_id, date, gallons, price_per_gallon, mileage) VALUES (?, ?, ?, ?, ?)',
            [vehicle_id, date, gallons, price_per_gallon || 0, mileage || 0]
        );
        await connection.end();
        res.status(201).json({ id: result.insertId, vehicle_id, date, gallons, price_per_gallon, mileage, station });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error adding fuel entry.' });
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
//END ROUTES TO HANDLE API REQUESTS
//////////////////////////////////////


// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});