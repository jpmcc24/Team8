////////////////////////////////////////////////////////////////
//DATAMODEL.JS
//THIS IS YOUR "MODEL", IT INTERACTS WITH THE ROUTES ON YOUR
//SERVER TO FETCH AND SEND DATA.  IT DOES NOT INTERACT WITH
//THE VIEW (dashboard.html) OR THE CONTROLLER (dashboard.js)
//DIRECTLY.  IT IS A "MIDDLEMAN" BETWEEN THE SERVER AND THE
//CONTROLLER.  ALL IT DOES IS MANAGE DATA.
////////////////////////////////////////////////////////////////

const DataModel = (function () {
    //WE CAN STORE DATA HERE SO THAT WE DON'T HAVE TO FETCH IT
    //EVERY TIME WE NEED IT.  THIS IS CALLED "CACHING".
    let token = null;

    // Internal helper that handles all fetch calls.
    // Redirects to login on 401/403; throws on other errors.
    async function request(method, path, body) {
        if (!token) {
            console.error('Token is not set.');
            return null;
        }

        const opts = {
            method,
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json',
            },
        };

        if (body) opts.body = JSON.stringify(body);

        const response = await fetch(path, opts);

        if (response.status === 401 || response.status === 403) {
            // Token is missing or expired — send user back to login
            localStorage.removeItem('jwtToken');
            window.location.href = '/';
            return null;
        }

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || 'Request failed');
        }

        return response.json();
    }

    return {
        // Store the JWT so every subsequent request is authenticated
        setToken: function (newToken) {
            token = newToken;
        },

        //////////////////////////////
        // USER
        //////////////////////////////
        getUsers: async function () {
            const data = await request('GET', '/api/users');
            return data ? data.emails : [];
        },

        //////////////////////////////
        // VEHICLES
        //////////////////////////////
        getVehicles: async function () {
            const data = await request('GET', '/api/vehicles');
            return data || [];
        },

        addVehicle: async function (vehicleData) {
            return request('POST', '/api/vehicles', vehicleData);
        },

        //////////////////////////////
        // MAINTENANCE LOG
        //////////////////////////////
        getMaintenance: async function () {
            const data = await request('GET', '/api/maintenance');
            return data || [];
        },

        addMaintenance: async function (entry) {
            return request('POST', '/api/maintenance', entry);
        },

        //////////////////////////////
        // FUEL LOG
        //////////////////////////////
        getFuel: async function () {
            const data = await request('GET', '/api/fuel');
            return data || [];
        },

        addFuel: async function (entry) {
            return request('POST', '/api/fuel', entry);
        },

        //////////////////////////////
        // REMINDERS
        //////////////////////////////
        getReminders: async function () {
            const data = await request('GET', '/api/reminders');
            return data || [];
        },

        addReminder: async function (entry) {
            return request('POST', '/api/reminders', entry);
        },

        completeReminder: async function (id) {
            return request('PUT', '/api/reminders/' + id + '/complete');
        },
    };
})();