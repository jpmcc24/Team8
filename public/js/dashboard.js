////////////////////////////////////////////////////////////////
// DASHBOARD.JS
// CONTROLLER — sits between the model (datamodel.js)
// and the view (dashboard.html)
////////////////////////////////////////////////////////////////

document.addEventListener('DOMContentLoaded', () => {

    //////////////////////////////////////////
    // JWT TOKEN CHECK
    // Redirect to login if no token found
    //////////////////////////////////////////
    const token = localStorage.getItem('jwtToken');
    if (!token) {
        window.location.href = '/';
        return;
    }

    // Pass token to the data model
    DataModel.setToken(token);

    //////////////////////////////////////////
    // ELEMENTS
    //////////////////////////////////////////
    const logoutButton = document.getElementById('logoutButton');
    const navItems     = document.querySelectorAll('.nav-item');

    //////////////////////////////////////////
    // SIDEBAR NAV SWITCHING
    //////////////////////////////////////////
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-section');
            if (!target) return;

            // Deactivate all nav items and sections
            navItems.forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

            // Activate selected
            item.classList.add('active');
            document.getElementById(target).classList.add('active');
        });
    });

    //////////////////////////////////////////
    // LOGOUT
    //////////////////////////////////////////
    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    //////////////////////////////////////////
    // ACCOUNT / PROFILE NAV
    //////////////////////////////////////////
    document.getElementById('accountNavItem').addEventListener('click', () => {
        window.location.href = '/account';
    });

    //////////////////////////////////////////
    // INITIAL PAGE LOAD
    // Fetch current user and display email in header
    // Also demonstrates a protected route call on load
    //////////////////////////////////////////
    renderUserDisplay();

    ////////////////////////////////////////////////////////////////
    // ADD EVENT LISTENERS FOR EACH FEATURE BELOW AS YOU BUILD THEM
    ////////////////////////////////////////////////////////////////

    // -- VEHICLES --
    // document.getElementById('addVehicleBtn').addEventListener('click', handleAddVehicle);
    // document.getElementById('showAddVehicleBtn').addEventListener('click', handleShowAddVehicleForm);
    // document.getElementById('cancelAddVehicleBtn').addEventListener('click', handleCancelAddVehicle);

    // -- MAINTENANCE --
    // document.getElementById('addMaintenanceBtn').addEventListener('click', handleAddMaintenance);
    // document.getElementById('showAddMaintenanceBtn').addEventListener('click', handleShowAddMaintenanceForm);
    // document.getElementById('maintenanceVehicleSelect').addEventListener('change', handleMaintenanceVehicleChange);

    // -- REMINDERS --
    // document.getElementById('addReminderBtn').addEventListener('click', handleAddReminder);
    // document.getElementById('showAddReminderBtn').addEventListener('click', handleShowAddReminderForm);
    // document.getElementById('remindersVehicleSelect').addEventListener('change', handleRemindersVehicleChange);

    // -- FUEL --
    // document.getElementById('addFuelBtn').addEventListener('click', handleAddFuel);
    // document.getElementById('showAddFuelBtn').addEventListener('click', handleShowAddFuelForm);
    // document.getElementById('fuelVehicleSelect').addEventListener('change', handleFuelVehicleChange);

    // -- COSTS --
    // document.getElementById('costsFilterBtn').addEventListener('click', handleCostsFilter);
    // document.getElementById('costsVehicleSelect').addEventListener('change', handleCostsVehicleChange);

});

////////////////////////////////////////////////////////////////
// FUNCTIONS TO MANIPULATE THE DOM
////////////////////////////////////////////////////////////////

// Fetches the current logged in user and displays their email in the header
// Uses getCurrentUser() which calls the protected GET /api/users/me route
async function renderUserDisplay() {
    const usernameDisplay = document.getElementById('usernameDisplay');
    if (!usernameDisplay) return;

    try {
        const user = await DataModel.getCurrentUser();
        if (user && user.email) {
            usernameDisplay.textContent = user.email;
        }
    } catch (error) {
        // Fall back to getUsers() to confirm token is valid
        const users = await DataModel.getUsers();
        if (users.length > 0) {
            usernameDisplay.textContent = 'Logged in';
        }
    }
}

////////////////////////////////////////////////////////////////
// FEATURE RENDER FUNCTIONS — ADD BELOW AS YOU BUILD EACH EPIC
////////////////////////////////////////////////////////////////

// -- EPIC 1: VEHICLES --
// async function renderVehicleList() {
//     const vehicleList = document.getElementById('vehicleList');
//     vehicleList.innerHTML = '<div class="loading-message">Loading vehicles...</div>';
//     const vehicles = await DataModel.getVehicles();
//     vehicleList.innerHTML = '';
//     if (vehicles.length === 0) {
//         vehicleList.innerHTML = '<div class="empty-state"><div class="empty-title">No vehicles yet</div><p>Click Add Vehicle to get started.</p></div>';
//         return;
//     }
//     vehicles.forEach(vehicle => {
//         const card = document.createElement('div');
//         card.classList.add('vehicle-card');
//         card.innerHTML = `
//             <div class="vehicle-year">${vehicle.year}</div>
//             <div class="vehicle-name">${vehicle.make} ${vehicle.model}</div>
//             <div class="vehicle-miles">${vehicle.current_mileage.toLocaleString()} miles</div>
//         `;
//         vehicleList.appendChild(card);
//     });
// }

// -- EPIC 2: MAINTENANCE LOG --
// async function renderMaintenanceLog(vehicleId) {
//     const maintenanceList = document.getElementById('maintenanceList');
//     maintenanceList.innerHTML = '<div class="loading-message">Loading...</div>';
//     const records = await DataModel.getMaintenanceLog(vehicleId);
//     maintenanceList.innerHTML = '';
//     if (records.length === 0) {
//         maintenanceList.innerHTML = '<div class="empty-state"><div class="empty-title">No records yet</div></div>';
//         return;
//     }
//     // Build table from records here
// }

// -- EPIC 3: REMINDERS --
// async function renderReminderList(vehicleId) { ... }

// -- EPIC 4: FUEL TRACKER --
// async function renderFuelLog(vehicleId) { ... }

// -- EPIC 5: COST DASHBOARD --
// async function renderCostDashboard(vehicleId) { ... }