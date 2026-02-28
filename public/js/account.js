////////////////////////////////////////////////////////////////
// CONTROLLER FOR ACCOUNT PAGE
////////////////////////////////////////////////////////////////

document.addEventListener('DOMContentLoaded', () => {

    //////////////////////////////////////////
    // ELEMENTS
    //////////////////////////////////////////
    const logoutButton = document.getElementById('logoutButton');
    const dashboardButton = document.getElementById('dashboardButton');
    //////////////////////////////////////////


    //////////////////////////////////////////
    // EVENT LISTENERS
    //////////////////////////////////////////

    // Logout from account page
    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    // Go back to dashboard from account page
    dashboardButton.addEventListener('click', () => {
        window.location.href = '/dashboard';
    });


    //////////////////////////////////////////
    // INITIAL PAGE LOAD LOGIC
    //////////////////////////////////////////

    const token = localStorage.getItem('jwtToken');

    if (!token) {
        window.location.href = '/';
    } else {
        DataModel.setToken(token);
        renderAccountInfo();
    }

});
///////////////////////////////////////////////////////////////



///////////////////////////////////////////////////////////////
// FUNCTION TO MANIPULATE THE DOM
///////////////////////////////////////////////////////////////

async function renderAccountInfo() {

    const emailElement = document.getElementById('userEmail');

    try {
        const user = await DataModel.getCurrentUser();
        emailElement.textContent = user.email;

    } catch (error) {
        console.error("Error loading account info:", error);
    }

///////////////////////////////////////////////////////////////

}
