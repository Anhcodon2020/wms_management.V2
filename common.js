document.addEventListener("DOMContentLoaded", function() {
    const menu = document.querySelector('.sidebar .menu');
    if (menu && !menu.querySelector('a[href="/carton-backup"]')) {
        const item = document.createElement('li');
        item.innerHTML = '<a href="/carton-backup">📦 Carton Dự Phòng</a>';
        menu.appendChild(item);
    }

    // Lấy đường dẫn hiện tại (ví dụ: /dashboard hoặc /inbound.html)
    const currentPath = window.location.pathname;
    const menuLinks = document.querySelectorAll('.sidebar .menu a');

    menuLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;

        // Kiểm tra nếu đường dẫn hiện tại khớp với href của link
        // Xử lý cả trường hợp có hoặc không có đuôi .html
        if (currentPath === href || (href !== '/' && currentPath.includes(href))) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
});
