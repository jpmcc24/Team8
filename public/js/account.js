////////////////////////////////////////////////////////////////
// CONTROLLER FOR ACCOUNT PAGE
////////////////////////////////////////////////////////////////

document.addEventListener('DOMContentLoaded', () => {

    //////////////////////////////////////////
    // ELEMENTS
    //////////////////////////////////////////
    const logoutButton       = document.getElementById('logoutButton');
    const dashboardButton    = document.getElementById('dashboardButton');
    const deleteAccountButton = document.getElementById('deleteAccountButton');
    const deleteAccountModal  = document.getElementById('deleteAccountModal');
    const deleteModalClose    = document.getElementById('deleteModalClose');
    const deleteAccountCancel = document.getElementById('deleteAccountCancel');
    const deleteAccountConfirm = document.getElementById('deleteAccountConfirm');
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

    // Open delete confirmation modal
    deleteAccountButton.addEventListener('click', () => {
        deleteAccountModal.style.display = 'flex';
    });

    // Close modal on X or Cancel
    deleteModalClose.addEventListener('click', () => {
        deleteAccountModal.style.display = 'none';
    });
    deleteAccountCancel.addEventListener('click', () => {
        deleteAccountModal.style.display = 'none';
    });
    deleteAccountModal.addEventListener('click', (e) => {
        if (e.target === deleteAccountModal) deleteAccountModal.style.display = 'none';
    });

    // Confirm account deletion
    deleteAccountConfirm.addEventListener('click', async () => {
        deleteAccountConfirm.disabled = true;
        deleteAccountConfirm.textContent = 'DELETING...';
        try {
            await DataModel.deleteAccount();
            localStorage.removeItem('jwtToken');
            window.location.href = '/';
        } catch (error) {
            console.error('Error deleting account:', error);
            deleteAccountConfirm.disabled = false;
            deleteAccountConfirm.textContent = 'YES, DELETE ACCOUNT';
            alert('Failed to delete account. Please try again.');
        }
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