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
    const logoutButton  = document.getElementById('logoutButton');
    const accountButton = document.getElementById('accountButton');
    const navTabs       = document.querySelectorAll('.nav-tab');

    //////////////////////////////////////////
    // NAV TAB SWITCHING
    //////////////////////////////////////////
    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-section');

            // Deactivate all tabs and sections
            navTabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

            // Activate selected
            tab.classList.add('active');
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
    // ACCOUNT PAGE
    //////////////////////////////////////////
    accountButton.addEventListener('click', () => {
        window.location.href = '/account';
    });

    //////////////////////////////////////////
    // INITIAL PAGE LOAD
    // Demonstrate a protected route call on load
    //////////////////////////////////////////
    renderUserDisplay();

    ////////////////////////////////////////////////////////////////
    // ADD EVENT LISTENERS FOR EACH FEATURE BELOW AS YOU BUILD THEM
    ////////////////////////////////////////////////////////////////

    // -- VEHICLES --
    // document.getElementById('addVehicleBtn').addEventListener('click', handleAddVehicle);

    // -- MAINTENANCE --
    // document.getElementById('addMaintenanceBtn').addEventListener('click', handleAddMaintenance);
    // document.getElementById('maintenanceVehicleSelect').addEventListener('change', handleMaintenanceVehicleChange);

    // -- REMINDERS --
    // document.getElementById('addReminderBtn').addEventListener('click', handleAddReminder);
    // document.getElementById('remindersVehicleSelect').addEventListener('change', handleRemindersVehicleChange);

    // -- FUEL --
    // document.getElementById('addFuelBtn').addEventListener('click', handleAddFuel);
    // document.getElementById('fuelVehicleSelect').addEventListener('change', handleFuelVehicleChange);

    // -- COSTS --
    // document.getElementById('costsFilterBtn').addEventListener('click', handleCostsFilter);
    // document.getElementById('costsVehicleSelect').addEventListener('change', handleCostsVehicleChange);

});

////////////////////////////////////////////////////////////////
// FUNCTIONS TO MANIPULATE THE DOM
////////////////////////////////////////////////////////////////

// Shows the logged-in user's email in the header
// Also demonstrates a protected route call (GET /api/users)
async function renderUserDisplay() {
    const users = await DataModel.getUsers();
    const usernameDisplay = document.getElementById('usernameDisplay');
    if (usernameDisplay && users.length > 0) {
        // Just confirm the token works — future sprints will show the actual username
        usernameDisplay.textContent = 'Logged in';
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
//         vehicleList.innerHTML = '<div class="empty-state">No vehicles added yet.</div>';
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
//         maintenanceList.innerHTML = '<div class="empty-state">No service records yet.</div>';
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