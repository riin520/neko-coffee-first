const API_URL = "http://localhost:3000/api";

const app = {
  user: null,
  cart: [],
  _allOrders: [], // Cache full order list for client-side date filtering
  _currentOrderTab: null,
  _lastUnreadCount: undefined,
  _adminBranches: [],
  _adminShifts: [],
  notiInterval: null,

  // =====================================================================
  // DELIVERY TOGGLE — reads from radio buttons
  // =====================================================================
  toggleDelivery() {
    const radioDelivery = document.getElementById("radio-delivery");
    const deliveryInfo = document.getElementById("delivery-info");
    if (!radioDelivery || !deliveryInfo) return;

    if (radioDelivery.checked) {
      deliveryInfo.classList.add("show");
    } else {
      deliveryInfo.classList.remove("show");
    }
  },

  // =====================================================================
  // INIT
  // =====================================================================
  init() {
    this.overrideNativeAlerts();

    // Nhấn ESC để đóng popup
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const centerModal = document.getElementById("custom-center-modal");
        const detailModal = document.getElementById("admin-shift-detail-modal");
        const reviewModal = document.getElementById("review-modal");
        if (centerModal && !centerModal.classList.contains("hidden")) this.closeModal();
        if (detailModal && !detailModal.classList.contains("hidden")) this.closeShiftDetailModal();
        if (reviewModal && !reviewModal.classList.contains("hidden")) this.closeReviewModal();
      }
    });

    // Click overlay để đóng modal
    document.querySelectorAll(".modal-overlay").forEach(overlay => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          if (overlay.id === "custom-center-modal") this.closeModal();
          if (overlay.id === "admin-shift-detail-modal") this.closeShiftDetailModal();
        }
      });
    });

    // Khôi phục user từ localStorage
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        this.user = JSON.parse(storedUser);
      } catch (e) {
        this.user = null;
      }
    }
    this.updateNav();
    this.navigate("home");
    this._setOrderDatePickerMax();

    // Click ra ngoài dropdown notification thì đóng
    document.addEventListener("click", () => {
      const dropdown = document.getElementById("notification-dropdown");
      if (dropdown && !dropdown.classList.contains("hidden")) {
        dropdown.classList.add("hidden");
      }
    });
  },

  // =====================================================================
  // NAV UPDATE — role-based visibility
  // =====================================================================
  updateNav() {
    const loginNav = document.getElementById("nav-login");
    const logoutNav = document.getElementById("nav-logout");
    const adminNav = document.getElementById("nav-admin");
    const ordersNav = document.getElementById("nav-orders");
    const shiftNav = document.getElementById("nav-shift");
    const pointsGroup = document.getElementById("points-group");
    const floatingCart = document.getElementById("floating-cart");
    const navNoti = document.getElementById("nav-notifications");

    if (this.user) {
      if (navNoti) navNoti.classList.remove("hidden");
      this.pollNotifications();
      if (loginNav) loginNav.classList.add("hidden");
      if (logoutNav) logoutNav.classList.remove("hidden");
      if (ordersNav) ordersNav.classList.remove("hidden");
      if (adminNav)
        this.user.role === "ADMIN"
          ? adminNav.classList.remove("hidden")
          : adminNav.classList.add("hidden");
      if (shiftNav)
        this.user.role === "STAFF"
          ? shiftNav.classList.remove("hidden")
          : shiftNav.classList.add("hidden");

      if (pointsGroup) {
        if (this.user.role === "CUSTOMER") {
          pointsGroup.classList.remove("hidden");
          const cp = document.getElementById("current-points");
          if (cp) cp.innerText = this.user.points || 0;
        } else {
          pointsGroup.classList.add("hidden");
        }
      }
      if (floatingCart) floatingCart.classList.remove("hidden");
      this.loadCart();
    } else {
      if (loginNav) loginNav.classList.remove("hidden");
      if (logoutNav) logoutNav.classList.add("hidden");
      if (adminNav) adminNav.classList.add("hidden");
      if (ordersNav) ordersNav.classList.add("hidden");
      if (shiftNav) shiftNav.classList.add("hidden");
      if (floatingCart) floatingCart.classList.add("hidden");
      if (pointsGroup) pointsGroup.classList.add("hidden");
      if (navNoti) navNoti.classList.add("hidden");
      this.stopNotificationPolling();
    }
  },

  // =====================================================================
  // NAVIGATE
  // =====================================================================
  navigate(viewId) {
    document
      .querySelectorAll(".view")
      .forEach((v) => v.classList.add("hidden"));
    const targetView = document.getElementById(`${viewId}-view`);
    if (targetView) targetView.classList.remove("hidden");

    if (viewId === "menu") this.loadMenu();
    if (viewId === "checkout") this.renderCheckout();
    if (viewId === "orders") this.loadOrders();
    if (viewId === "admin") this.loadReports();
    if (viewId === "shift-report") this.loadShiftReport();
    if (viewId === "login") this._updateAuthOverlay();
  },

  // =====================================================================
  // AUTH OVERLAY (SLIDER)
  // =====================================================================
  _updateAuthOverlay() {
    const container = document.getElementById("slider-container");
    if (container) container.classList.remove("right-panel-active");
  },

  toggleAuthForm(e) {
    if (e) e.preventDefault();
    const container = document.getElementById("slider-container");
    if (container) container.classList.toggle("right-panel-active");
  },

  // =====================================================================
  // LOGIN
  // =====================================================================
  async login() {
    const username = document.getElementById("login-username")?.value;
    const password = document.getElementById("login-password")?.value;
    const msgEl = document.getElementById("login-message");

    if (!username || !password) {
      if (msgEl) msgEl.innerText = "Vui lòng nhập đầy đủ thông tin!!!";
      return;
    }

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.success) {
        if (msgEl) msgEl.innerText = "";
        this.user = data.user;
        localStorage.setItem("user", JSON.stringify(this.user));
        this.updateNav();
        this.navigate("menu");
      } else {
        if (msgEl) msgEl.innerText = "Tài khoản hoặc mật khẩu không chính xác!!!";
      }
    } catch (err) {
      if (msgEl) msgEl.innerText = "Lỗi kết nối máy chủ";
    }
  },

  // =====================================================================
  // REGISTER
  // =====================================================================
  async register() {
    const tenkh = document.getElementById("reg-name")?.value;
    const sdt = document.getElementById("reg-phone")?.value;
    const taikhoan = document.getElementById("reg-username")?.value;
    const matkhau = document.getElementById("reg-password")?.value;
    const msgEl = document.getElementById("reg-message");

    if (!tenkh || !sdt || !taikhoan || !matkhau) {
      if (msgEl) msgEl.innerText = "Vui lòng nhập đầy đủ thông tin!!!";
      return;
    }

    const phoneRegex = /(84|0[3|5|7|8|9])+([0-9]{8})\b/;
    if (!phoneRegex.test(sdt)) {
      if (msgEl) msgEl.innerText = "Vui lòng nhập thông tin chính xác!!! (SĐT không hợp lệ)";
      return;
    }

    const passRegex = /^[A-Z][A-Za-z0-9@$!%*?&]{6,}$/;
    if (!passRegex.test(matkhau)) {
      if (msgEl) msgEl.innerText = "Vui lòng nhập thông tin chính xác!!! (Mật khẩu > 6 ký tự, chữ đầu viết hoa)";
      return;
    }

    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenkh, sdt, taikhoan, matkhau }),
      });
      const data = await res.json();

      if (data.success) {
        if (msgEl) msgEl.innerText = "";
        this.showPopup(data.message || "Đăng ký thành công!", "success", () => {
          const unInput = document.getElementById("login-username");
          const pwInput = document.getElementById("login-password");
          if (unInput) unInput.value = taikhoan;
          if (pwInput) pwInput.value = matkhau;
          this.toggleAuthForm();
        });
      } else {
        if (msgEl) msgEl.innerText = data.message;
      }
    } catch (err) {
      if (msgEl) msgEl.innerText = "Lỗi kết nối máy chủ";
    }
  },

  // =====================================================================
  // LOGOUT
  // =====================================================================
  logout() {
    if (this.user && this.user.role === "STAFF" && this.user.maca) {
      this.showToast("Bạn phải nộp Báo Cáo Ca trước khi đăng xuất!", "error");
      this.navigate("shift-report");
      return;
    }
    this.user = null;
    this.cart = [];
    this._lastUnreadCount = undefined;
    localStorage.removeItem("user");
    this.updateNav();
    this.navigate("home");
    this.updateCartCount();
  },

  // =====================================================================
  // CUSTOM POPUP
  // =====================================================================
  showPopup(message, type = "success", callback = null, btnText = "OK") {
    let popup = document.getElementById("custom-popup");
    if (!popup) {
      popup = document.createElement("div");
      popup.id = "custom-popup";
      popup.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center;";
      document.body.appendChild(popup);
    }
    const icon = type === "success" ? "fa-circle-check" : "fa-circle-xmark";
    const color = type === "success" ? "var(--success)" : "var(--danger)";
    popup.innerHTML = `
      <div style="background: white; padding: 30px 50px; border-radius: 12px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.2); animation: fadeInUp 0.3s ease;">
        <i class="fa-solid ${icon}" style="color: ${color}; font-size: 50px; margin-bottom: 15px;"></i>
        <h3 style="margin-bottom: 20px; color: var(--text-primary); font-size: 18px; font-weight: 600;">${message}</h3>
        <button class="btn-primary" id="custom-popup-btn">${btnText}</button>
      </div>
    `;
    popup.classList.remove("hidden");
    document.getElementById("custom-popup-btn").onclick = () => {
      popup.classList.add("hidden");
      if (callback) callback();
    };
  },

  // =====================================================================
  // LOAD MENU
  // =====================================================================
  async loadMenu() {
    try {
      const res = await fetch(`${API_URL}/products`);
      const data = await res.json();
      if (data.success) {
        const list = document.getElementById("product-list");
        if (!list) return;
        list.innerHTML = "";
        data.data.forEach((p) => {
          list.innerHTML += `
            <div class="product-card">
              <div>
                <span class="product-tag">${p.TENLOAI}</span>
                <h3>${p.TENMON}</h3>
              </div>
              <div>
                <div class="product-price">${p.DONGIA.toLocaleString()}đ</div>
                <button class="btn-primary w-100" onclick="app.addToCart('${p.MAMON}', '${p.TENMON}', ${p.DONGIA})">
                  <i class="fa-solid fa-plus"></i> Thêm vào giỏ
                </button>
              </div>
            </div>
          `;
        });
      }
    } catch (err) {
      console.error(err);
    }
  },

  // =====================================================================
  // CART MANAGEMENT
  // =====================================================================
  async loadCart() {
    if (!this.user) return;
    if (this.user.role === "CUSTOMER") {
      try {
        const res = await fetch(`${API_URL}/cart?makh=${this.user.id}`);
        const data = await res.json();
        if (data.success) {
          this.cart = data.data || [];
        }
      } catch (err) {
        console.error(err);
      }
    }
    this.updateCartCount();
  },

  async addToCart(mamon, tenmon, dongia) {
    if (!this.user) {
      alert("Vui lòng đăng nhập để đặt món!");
      this.navigate("login");
      return;
    }

    let item = this.cart.find((c) => c.MAMON === mamon);
    let newQty = item ? item.SOLUONG + 1 : 1;

    if (this.user.role === "CUSTOMER") {
      try {
        const res = await fetch(`${API_URL}/cart`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ makh: this.user.id, mamon, soluong: newQty }),
        });
        const data = await res.json();
        if (data.success) await this.loadCart();
      } catch (err) {
        console.error(err);
      }
    } else {
      if (item) {
        item.SOLUONG = newQty;
      } else {
        this.cart.push({
          MAMON: mamon,
          TENMON: tenmon,
          DONGIA: dongia,
          SOLUONG: 1,
        });
      }
      this.updateCartCount();
    }

    const cartIcon = document.getElementById("floating-cart");
    if (cartIcon) {
      cartIcon.style.transform = "scale(1.3)";
      setTimeout(() => (cartIcon.style.transform = "scale(1)"), 200);
    }
  },

  async updateCartItem(mamon, diff) {
    let item = this.cart.find((c) => c.MAMON === mamon);
    if (!item) return;

    let newQty = item.SOLUONG + diff;

    if (this.user.role === "CUSTOMER") {
      try {
        await fetch(`${API_URL}/cart`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ makh: this.user.id, mamon, soluong: newQty }),
        });
        await this.loadCart();
        this.renderCheckout();
      } catch (err) {
        console.error(err);
      }
    } else {
      if (newQty <= 0) {
        this.cart = this.cart.filter((c) => c.MAMON !== mamon);
      } else {
        item.SOLUONG = newQty;
      }
      this.updateCartCount();
      this.renderCheckout();
    }
  },

  updateCartCount() {
    const count = this.cart.reduce((sum, item) => sum + item.SOLUONG, 0);
    const countEl = document.getElementById("cart-count");
    if (countEl) countEl.innerText = count;
  },

  // =====================================================================
  // RENDER CHECKOUT
  // =====================================================================
  renderCheckout() {
    const container = document.getElementById("checkout-cart");
    if (!container) return;
    container.innerHTML = "";

    if (this.cart.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-cart-shopping"></i>
          <p>Giỏ hàng đang trống</p>
          <small>Thêm món từ <a href="#" onclick="app.navigate('menu')" style="color:var(--primary);">thực đơn</a> để bắt đầu</small>
        </div>`;
      this.calculateTotal();
      return;
    }

    this.cart.forEach((item) => {
      container.innerHTML += `
        <div class="cart-item">
          <div>
            <div class="cart-item-name">${item.TENMON}</div>
            <div class="cart-item-price">${item.DONGIA.toLocaleString()}đ / món</div>
          </div>
          <div class="cart-qty-group">
            <button class="qty-btn" onclick="app.updateCartItem('${item.MAMON}', -1)">−</button>
            <span class="cart-qty-text">${item.SOLUONG}</span>
            <button class="qty-btn" onclick="app.updateCartItem('${item.MAMON}', 1)">+</button>
          </div>
        </div>
      `;
    });

    this.calculateTotal();
  },

  // =====================================================================
  // CALCULATE TOTAL
  // =====================================================================
  calculateTotal() {
    let totalAmount = this.cart.reduce(
      (sum, item) => sum + item.SOLUONG * item.DONGIA,
      0,
    );
    const discountEl = document.getElementById("checkout-discount");
    let discountVal = discountEl ? parseInt(discountEl.value) || 0 : 0;
    let discountAmount = 0;

    if (this.user && this.user.role === "CUSTOMER") {
      if (discountVal > (this.user.points || 0)) {
        alert("Bạn không đủ điểm tích lũy!");
        if (discountEl) discountEl.value = "0";
        discountVal = 0;
      }
      if (discountVal === 1000) discountAmount = totalAmount * 0.1;
      else if (discountVal === 2000) discountAmount = totalAmount * 0.2;
    }

    let finalAmount = totalAmount - discountAmount;

    const subTotalEl = document.getElementById("sub-total");
    const discountTotalEl = document.getElementById("discount-total");
    const finalTotalEl = document.getElementById("final-total");

    if (subTotalEl) subTotalEl.innerText = totalAmount.toLocaleString();
    if (discountTotalEl)
      discountTotalEl.innerText = discountAmount.toLocaleString();
    if (finalTotalEl) finalTotalEl.innerText = finalAmount.toLocaleString();
  },

  // =====================================================================
  // CHECKOUT
  // =====================================================================
  async checkout() {
    if (!this.user) return alert("Vui lòng đăng nhập để thanh toán!");
    if (this.cart.length === 0) return alert("Giỏ hàng đang trống!");

    let macn = this.user.macn;
    if (this.user.role === "CUSTOMER") {
      const macnSelect = document.getElementById("checkout-macn");
      macn = macnSelect ? macnSelect.value : "CN01";
    }

    const radioDelivery = document.getElementById("radio-delivery");
    const loaidon =
      radioDelivery && radioDelivery.checked ? "Giao hàng" : "Mang đi";
    let diachigiao = null;

    if (loaidon === "Giao hàng") {
      const phoneEl = document.getElementById("checkout-phone");
      const addressEl = document.getElementById("checkout-address");
      const phone = phoneEl ? phoneEl.value.trim() : "";
      const address = addressEl ? addressEl.value.trim() : "";

      const phoneRegex = /(84|0[3|5|7|8|9])+([0-9]{8})\b/g;
      if (!phoneRegex.test(phone)) {
        return alert("Số điện thoại không hợp lệ!");
      }

      if (address.length < 12) {
        return alert("ĐỊA CHỈ KHÔNG HỢP LỆ!!");
      }
      if (address.split(" ").length < 3) {
        return alert("ĐỊA CHỈ KHÔNG HỢP LỆ!!");
      }
      const isSpam = address.split(" ").some(word => word.length > 15);
      if (isSpam) {
        return alert("ĐỊA CHỈ KHÔNG HỢP LỆ!!");
      }

      diachigiao = `SĐT: ${phone} - ĐC: ${address}`;
    }

    const discountEl = document.getElementById("checkout-discount");
    const discount_points = discountEl ? discountEl.value : 0;

    try {
      const res = await fetch(`${API_URL}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: this.user,
          cart: this.cart,
          discount_points,
          loaidon,
          diachigiao,
          macn
        }),
      });
      const data = await res.json();

      if (data.success) {
        alert("Đặt hàng thành công!");
        if (data.newMaca) {
          this.user.maca = data.newMaca;
          localStorage.setItem("user", JSON.stringify(this.user));
        }

        this.cart = [];
        this.updateCartCount();

        if (this.user.role === "CUSTOMER") {
          const meRes = await fetch(`${API_URL}/auth/me?makh=${this.user.id}`);
          const meData = await meRes.json();
          if (meData.success) {
            this.user.points = meData.points;
            localStorage.setItem("user", JSON.stringify(this.user));
            this.updateNav();
          }
        }

        const pEl = document.getElementById("checkout-phone");
        const aEl = document.getElementById("checkout-address");
        if (pEl) pEl.value = "";
        if (aEl) aEl.value = "";
        if (discountEl) discountEl.value = "0";

        const radioPickup = document.getElementById("radio-pickup");
        if (radioPickup) radioPickup.checked = true;
        this.toggleDelivery();

        this.navigate("orders");
      } else {
        alert("Lỗi: " + data.message);
      }
    } catch (err) {
      console.error(err);
      alert("Lỗi kết nối máy chủ");
    }
  },

  // =====================================================================
  // LOAD ORDERS + DATE FILTER LOGIC
  // =====================================================================
  _setOrderDatePickerMax() {
    const datePicker = document.getElementById("order-date-filter");
    if (datePicker) {
      const today = new Date().toISOString().split("T")[0];
      datePicker.max = today;
    }
  },

  filterOrdersByDate() {
    const datePicker = document.getElementById("order-date-filter");
    if (!datePicker) return;

    const today = new Date().toISOString().split("T")[0];
    if (datePicker.value > today) {
      datePicker.value = today;
      alert("Không thể lọc đơn hàng theo ngày trong tương lai!");
      return;
    }

    this._renderOrderList(this._allOrders, datePicker.value);
  },

  clearDateFilter() {
    const datePicker = document.getElementById("order-date-filter");
    if (datePicker) datePicker.value = "";
    this._renderOrderList(this._allOrders, "");
  },

  switchOrderTab(tab) {
    document.getElementById("tab-current-orders").classList.remove("active");
    document.getElementById("tab-history-orders").classList.remove("active");
    document.getElementById("tab-current-orders").style.borderBottomColor = "transparent";
    document.getElementById("tab-current-orders").style.color = "var(--text-secondary)";
    document.getElementById("tab-history-orders").style.borderBottomColor = "transparent";
    document.getElementById("tab-history-orders").style.color = "var(--text-secondary)";

    const activeBtn = document.getElementById(`tab-${tab}-orders`);
    if (activeBtn) {
      activeBtn.classList.add("active");
      activeBtn.style.borderBottomColor = "var(--primary)";
      activeBtn.style.color = "var(--primary)";
    }

    this._currentOrderTab = tab;

    const datePicker = document.getElementById("order-date-filter");
    if (datePicker) datePicker.value = "";

    this._renderOrderList(this._allOrders, "");
  },

  async loadOrders() {
    if (!this.user) return;
    this._setOrderDatePickerMax();

    const tabsContainer = document.getElementById("customer-order-tabs");
    if (this.user.role === "CUSTOMER") {
      if (tabsContainer) tabsContainer.style.display = "flex";
      if (!this._currentOrderTab) this._currentOrderTab = "current";
      const activeBtn = document.getElementById(`tab-${this._currentOrderTab}-orders`);
      if (activeBtn) {
        document.getElementById("tab-current-orders").classList.remove("active");
        document.getElementById("tab-history-orders").classList.remove("active");
        document.getElementById("tab-current-orders").style.borderBottomColor = "transparent";
        document.getElementById("tab-current-orders").style.color = "var(--text-secondary)";
        document.getElementById("tab-history-orders").style.borderBottomColor = "transparent";
        document.getElementById("tab-history-orders").style.color = "var(--text-secondary)";
        activeBtn.classList.add("active");
        activeBtn.style.borderBottomColor = "var(--primary)";
        activeBtn.style.color = "var(--primary)";
      }
    } else {
      if (tabsContainer) tabsContainer.style.display = "none";
      this._currentOrderTab = "all";
    }

    try {
      const res = await fetch(
        `${API_URL}/orders?role=${this.user.role}&id=${this.user.id}&macn=${this.user.macn}`,
      );
      const data = await res.json();

      if (data.success) {
        this._allOrders = data.data || [];
        const datePicker = document.getElementById("order-date-filter");
        const filterVal = datePicker ? datePicker.value : "";
        this._renderOrderList(this._allOrders, filterVal);
      } else {
        const container = document.getElementById("orders-list");
        if (container) container.innerHTML = "<p>Không thể tải đơn hàng.</p>";
      }
    } catch (err) {
      console.error(err);
    }
  },

  _renderOrderList(orders, dateFilter) {
    const container = document.getElementById("orders-list");
    const badge = document.getElementById("orders-count-badge");
    if (!container) return;
    container.innerHTML = "";

    let filtered = orders;

    if (this.user.role === "CUSTOMER") {
      if (this._currentOrderTab === "history") {
        filtered = filtered.filter(o => o.TRANGTHAI === "Hoàn thành");
      } else {
        filtered = filtered.filter(o => o.TRANGTHAI !== "Hoàn thành");
      }
    }

    if (dateFilter) {
      filtered = filtered.filter((o) => {
        const d = new Date(o.NGAYLAP).toISOString().split("T")[0];
        return d === dateFilter;
      });
    }

    if (badge) {
      badge.innerHTML = `<i class="fa-solid fa-list"></i> ${filtered.length} đơn hàng`;
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-receipt"></i>
          <p>Không có đơn hàng nào</p>
          <small>${dateFilter ? "Thử chọn ngày khác" : "Chưa có đơn hàng nào được tạo"}</small>
        </div>`;
      return;
    }

    filtered.forEach((o) => {
      const isCompleted = o.TRANGTHAI === "Hoàn thành";
      const completedClass = isCompleted ? "completed" : "";
      const statusBadgeClass = isCompleted
        ? "status-completed"
        : "status-pending";
      const statusIcon = isCompleted
        ? `<i class="fa-solid fa-circle-check"></i>`
        : `<i class="fa-solid fa-clock"></i>`;

      const detailsHTML = o.details
        .map((d) => `<li>${d.TENMON} ×${d.SOLUONG}</li>`)
        .join("");

      let actionBtn = "";
      if (this.user.role === "STAFF" && !isCompleted) {
        actionBtn = `
          <button class="btn-success btn-icon" style="padding:8px 16px; font-size:13px;"
            onclick="app.completeOrder(${o.MAHD})">
            <i class="fa-solid fa-check"></i> Hoàn thành
          </button>`;
      }

      let reviewHTML = "";
      if (isCompleted) {
        if (o.review) {
          let starsHTML = "";
          for (let i = 1; i <= 5; i++) {
            starsHTML += `<i class="fa-solid fa-star" style="color: ${i <= o.review.SOSAO ? 'var(--warning)' : 'var(--border-color)'}"></i>`;
          }
          let imgHTML = o.review.HINHANH ? `<img src="${o.review.HINHANH}" style="max-height: 80px; border-radius: 4px; margin-top: 8px;" />` : "";
          let replyHTML = "";

          if (o.review.PHANHOI_CUA_QUAN) {
            replyHTML = `
              <div style="margin-top: 10px; padding: 10px; background: var(--bg); border-left: 3px solid var(--primary); border-radius: 4px; font-size: 12px;">
                <strong><i class="fa-solid fa-reply"></i> Phản hồi từ quán:</strong>
                <p style="margin-top: 4px; color: var(--text-secondary);">${o.review.PHANHOI_CUA_QUAN}</p>
              </div>
            `;
          } else if (this.user.role !== "CUSTOMER") {
            replyHTML = `
              <div style="margin-top: 10px; display: flex; gap: 8px;">
                <input type="text" id="reply-input-${o.MAHD}" class="input-brutal" placeholder="Gõ phản hồi..." style="margin: 0; padding: 6px 10px; flex: 1;" />
                <button class="btn-primary" style="padding: 6px 12px; font-size: 12px;" onclick="app.submitReviewReply(${o.MAHD})">Gửi</button>
              </div>
            `;
          }

          reviewHTML = `
            <div style="margin-top: 15px; border-top: 1px dashed var(--border-color); padding-top: 15px;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                  <div style="font-size: 14px;">${starsHTML}</div>
                  <p style="font-size: 13px; color: var(--text-primary); margin-top: 6px;">${o.review.NOIDUNG || "<em>Không có nội dung</em>"}</p>
                  ${imgHTML}
                </div>
                <div style="font-size: 11px; color: var(--text-muted);">${new Date(o.review.NGAYTAO).toLocaleString('vi-VN')}</div>
              </div>
              ${replyHTML}
            </div>
          `;
        } else if (this.user.role === "CUSTOMER") {
          reviewHTML = `
            <div style="margin-top: 15px; border-top: 1px dashed var(--border-color); padding-top: 15px; text-align: center;">
              <button class="btn-ghost" style="padding: 6px 14px; font-size: 13px; color: var(--warning); border-color: var(--warning);" onclick="app.openReviewModal(${o.MAHD}, '${o.MACN}')">
                <i class="fa-solid fa-star"></i> Đánh giá đơn hàng
              </button>
            </div>
          `;
        }
      }

      const dateStr = new Date(o.NGAYLAP).toLocaleString("vi-VN");

      container.innerHTML += `
        <div class="order-card ${completedClass}">
          <div class="order-header">
            <span class="order-id">
              <i class="fa-solid fa-hashtag" style="font-size:13px; opacity:0.5;"></i>
              Đơn #${o.MAHD}
            </span>
            <span class="order-status-badge ${statusBadgeClass}">
              ${statusIcon} ${o.TRANGTHAI}
            </span>
          </div>

          <div class="order-meta">
            <span><i class="fa-solid fa-calendar"></i> ${dateStr}</span>
            <span><i class="fa-solid fa-tag"></i> ${o.LOAIDON}${o.DIACHIGIAO ? ` · ${o.DIACHIGIAO}` : ""}</span>
          </div>

          <ul class="order-items-list">${detailsHTML}</ul>

          <div class="order-footer">
            <span class="order-total">${o.TONGTIEN.toLocaleString()}đ</span>
            ${actionBtn}
          </div>
          ${reviewHTML}
        </div>
      `;
    });
  },

  // =====================================================================
  // COMPLETE ORDER
  // =====================================================================
  async completeOrder(mahd) {
    if (!this.user || this.user.role !== "STAFF") return;
    try {
      const res = await fetch(`${API_URL}/orders/${mahd}/complete`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maca: this.user.maca, macn: this.user.macn }),
      });
      const data = await res.json();
      if (data.success) {
        this.loadOrders();
      } else {
        alert(data.message);
      }
    } catch (err) {
      console.error(err);
    }
  },

  // =====================================================================
  // LOAD REPORTS (Admin) — Phiên bản chốt, bọc thép chống sập
  // =====================================================================
  async loadReports() {
    if (!this.user || this.user.role !== "ADMIN") return;
    try {
      const container = document.getElementById("reports-list");
      if (!container) return;

      // Ẩn lớp 2 khi load lại
      const layer2 = document.getElementById("admin-branch-shifts-container");
      if (layer2) layer2.classList.add("hidden");
      container.classList.remove("hidden");

      let data = { success: false, data: [] };
      let srData = { success: false, data: [] };

      try {
        const res = await fetch(`${API_URL}/reports`);
        if (res.ok) data = await res.json();
      } catch (e) { }

      try {
        const srRes = await fetch(`${API_URL}/admin/shift-reports`);
        if (srRes.ok) srData = await srRes.json();
      } catch (e) { }

      container.innerHTML = "";

      if (data.success && data.data) {
        this._adminBranches = data.data || [];
        this._adminShifts = (srData.success) ? (srData.data || []) : [];

        if (this._adminBranches.length === 0) {
          container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 40px; width: 100%;">Chưa có dữ liệu doanh thu</div>`;
          return;
        }

        this._adminBranches.forEach(b => {
          const doanhThu = b.TONGDOANHTHU || 0;
          container.innerHTML += `
             <div class="admin-branch-card" onclick="app.viewBranchShifts('${b.MACN}')">
               <h3><i class="fa-solid fa-store"></i> Chi nhánh ${b.MACN}</h3>
               <div class="revenue">${doanhThu.toLocaleString()}đ</div>
               <small><i class="fa-solid fa-hand-pointer"></i> Click để xem danh sách ca làm việc</small>
             </div>
           `;
        });
      } else {
        container.innerHTML = `<div style="text-align: center; color: var(--danger); padding: 40px; width: 100%;">Lỗi tải dữ liệu chi nhánh.</div>`;
      }
    } catch (err) {
      console.error("Lỗi crash UI:", err);
    }
  },

  // =====================================================================
  // ADMIN DRILL-DOWN: Lớp 2 — Xem ca của 1 chi nhánh
  // =====================================================================
  viewBranchShifts(macn) {
    const targetMacn = macn ? macn.trim() : "";
    const shifts = (this._adminShifts || []).filter(s => s.MACN && s.MACN.trim() === targetMacn);

    const container = document.getElementById("admin-branch-shifts-container");
    const list = document.getElementById("admin-branch-shifts-list");
    const title = document.getElementById("admin-branch-shifts-title");

    if (!container || !list || !title) return;

    document.getElementById("reports-list").classList.add("hidden");
    container.classList.remove("hidden");

    title.innerHTML = `<i class="fa-solid fa-list-check"></i> Danh sách ca - <strong style="color:var(--primary)">${targetMacn}</strong>`;

    if (shifts.length === 0) {
      list.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px; background: var(--bg); border-radius: var(--radius-md);">
            <i class="fa-solid fa-folder-open" style="font-size: 40px; margin-bottom: 15px; opacity: 0.5;"></i><br>
            <span style="font-size: 16px;">Chi nhánh này hiện chưa có báo cáo ca nào.</span>
        </div>`;
      return;
    }

    list.innerHTML = shifts.map(s => `
        <div class="admin-shift-item" onclick="app.viewShiftDetail(${s.MACA}, '${s.TENNV}', '${s.GIOVAO}')">
           <div><i class="fa-solid fa-hashtag" style="font-size:12px; opacity:0.5;"></i> Ca #${s.MACA} - NV: <strong>${s.TENNV}</strong></div>
           <div>Doanh thu: ${(s.TONGDOANHTHU || 0).toLocaleString()}đ</div>
        </div>
     `).join("");
  },

  backToBranches() {
    const container = document.getElementById("admin-branch-shifts-container");
    const reportsList = document.getElementById("reports-list");
    if (container && reportsList) {
      container.classList.add("hidden");
      reportsList.classList.remove("hidden");
    }
  },

  // =====================================================================
  // ADMIN DRILL-DOWN: Lớp 3 — Chi tiết 1 ca (Modal)
  // =====================================================================
  async viewShiftDetail(maca, tennv, giovao) {
    try {
      const res = await fetch(`${API_URL}/shift-report?maca=${maca}`);
      const data = await res.json();
      if (data.success) {
        const r = data.data;
        document.getElementById("modal-shift-id").innerHTML = `Mã Ca: <strong>#${maca}</strong>`;
        document.getElementById("modal-shift-nv").innerHTML = `Nhân viên: <strong>${tennv}</strong>`;
        document.getElementById("modal-shift-time").innerHTML = `Giờ vào: <strong>${new Date(giovao).toLocaleString("vi-VN")}</strong>`;

        const tbody = document.getElementById("modal-shift-tbody");
        if (r.items && r.items.length > 0) {
          tbody.innerHTML = r.items.map(i => `
                  <tr>
                     <td>${i.TENMON}</td>
                     <td style="text-align:center">${i.SOLUONG}</td>
                     <td style="text-align:right">${(i.THANHTIEN / i.SOLUONG).toLocaleString()}đ</td>
                     <td style="text-align:right; font-weight:600; color:var(--text-primary);">${i.THANHTIEN.toLocaleString()}đ</td>
                  </tr>
               `).join("");
        } else {
          tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 20px; color: var(--text-muted);">Chưa có món nào bán ra</td></tr>`;
        }

        document.getElementById("modal-shift-total").innerText = `${(r.TongTien || 0).toLocaleString()}đ`;
        document.getElementById("admin-shift-detail-modal").classList.remove("hidden");
      }
    } catch (err) {
      this.showToast("Lỗi lấy chi tiết ca", "error");
    }
  },

  closeShiftDetailModal() {
    document.getElementById("admin-shift-detail-modal").classList.add("hidden");
  },

  // =====================================================================
  // LOAD SHIFT REPORT (Staff)
  // =====================================================================
  async loadShiftReport() {
    if (!this.user || this.user.role !== "STAFF") return;
    const container = document.getElementById("shift-report-content");
    const btnSubmit = document.getElementById("btn-submit-shift-report");
    if (!container || !btnSubmit) return;

    if (!this.user.maca) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-clipboard-list"></i>
          <p>Chưa có đơn hàng nào trong ca làm việc mới</p>
          <small>Tạo đơn hàng đầu tiên để bắt đầu ca</small>
        </div>`;
      btnSubmit.classList.add("hidden");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/shift-report?maca=${this.user.maca}`);
      const data = await res.json();

      if (data.success) {
        const r = data.data;
        const gioVao = new Date(r.GIOVAO).toLocaleString("vi-VN");
        let itemsHTML = "";
        r.items.forEach((item) => {
          itemsHTML += `
            <tr>
              <td>${item.TENMON}</td>
              <td style="text-align:center;">${item.SOLUONG}</td>
              <td style="text-align:right; font-weight:600;">${item.THANHTIEN.toLocaleString()}đ</td>
            </tr>
          `;
        });

        container.innerHTML = `
          <div class="shift-report-info-grid">
            <div class="shift-info-card">
              <div class="shift-info-card-label"><i class="fa-solid fa-calendar"></i> Giờ vào ca</div>
              <div class="shift-info-card-value">${gioVao}</div>
            </div>
            <div class="shift-info-card">
              <div class="shift-info-card-label"><i class="fa-solid fa-user"></i> Nhân viên</div>
              <div class="shift-info-card-value">${this.user.name} (${this.user.id})</div>
            </div>
            <div class="shift-info-card">
              <div class="shift-info-card-label"><i class="fa-solid fa-hashtag"></i> Mã ca</div>
              <div class="shift-info-card-value">${this.user.maca}</div>
            </div>
            <div class="shift-info-card">
              <div class="shift-info-card-label"><i class="fa-solid fa-receipt"></i> Số đơn hàng</div>
              <div class="shift-info-card-value">${r.SoDonHang || 0}</div>
            </div>
          </div>

          <h3 style="font-size:14px; font-weight:700; margin-bottom:8px; color:var(--text-secondary);">
            <i class="fa-solid fa-list" style="color:var(--primary);"></i> Chi tiết món đã bán
          </h3>
          <table class="shift-table">
            <thead>
              <tr>
                <th>Tên món</th>
                <th style="text-align:center;">SL</th>
                <th style="text-align:right;">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHTML || '<tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding:20px;">Chưa có món nào</td></tr>'}
            </tbody>
          </table>

          <div class="shift-total-row">
            <span class="shift-total-label">
              <i class="fa-solid fa-coins"></i> Tổng doanh thu ca
            </span>
            <span class="shift-total-value">${(r.TongTien || 0).toLocaleString()}đ</span>
          </div>
        `;

        btnSubmit.dataset.tongtien = r.TongTien || 0;
        btnSubmit.classList.remove("hidden");
      } else {
        container.innerHTML = `<p style="color:var(--danger);">Lỗi: ${data.message}</p>`;
        btnSubmit.classList.add("hidden");
      }
    } catch (err) {
      console.error(err);
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-triangle-exclamation" style="color:var(--danger);"></i>
          <p>Lỗi kết nối máy chủ</p>
        </div>`;
      btnSubmit.classList.add("hidden");
    }
  },

  // =====================================================================
  // SUBMIT SHIFT REPORT — Server tự gửi thông báo cho admin
  // =====================================================================
  async submitShiftReport() {
    const btnSubmit = document.getElementById("btn-submit-shift-report");
    const tongtien = btnSubmit ? parseInt(btnSubmit.dataset.tongtien, 10) : 0;

    try {
      const res = await fetch(`${API_URL}/shift-report/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maca: this.user.maca,
          tongtien: tongtien,
          manv: this.user.id,
          macn: this.user.macn
        }),
      });
      const data = await res.json();

      if (data.success) {
        this.user.maca = null;
        localStorage.setItem("user", JSON.stringify(this.user));
        this.showModal("Ca Làm Việc Hoàn Tất", "Nộp báo cáo thành công! Ca của bạn đã được ghi nhận.", true);
      } else {
        this.showToast(data.message, "error");
      }
    } catch (err) {
      this.showToast("Lỗi kết nối máy chủ", "error");
    }
  },

  // =====================================================================
  // REVIEWS
  // =====================================================================
  openReviewModal(mahd, macn) {
    const modal = document.getElementById("review-modal");
    if (!modal) return;
    document.getElementById("review-mahd").value = mahd;
    document.getElementById("review-macn").value = macn;
    document.getElementById("review-content").value = "";
    document.getElementById("review-image").value = "";
    document.getElementById("review-image-base64").value = "";
    const preview = document.getElementById("review-image-preview");
    if (preview) preview.style.display = "none";
    this.setReviewStars(5);
    modal.classList.remove("hidden");
  },

  closeReviewModal() {
    const modal = document.getElementById("review-modal");
    if (modal) modal.classList.add("hidden");
  },

  setReviewStars(stars) {
    document.getElementById("review-stars").value = stars;
    const starBtns = document.querySelectorAll("#star-rating .star-btn");
    starBtns.forEach((btn, index) => {
      btn.style.color = index < stars ? "var(--warning)" : "var(--border-color)";
    });
  },

  handleReviewImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target.result;
      document.getElementById("review-image-base64").value = base64;
      const preview = document.getElementById("review-image-preview");
      const img = document.getElementById("review-image-img");
      if (preview && img) {
        img.src = base64;
        preview.style.display = "block";
      }
    };
    reader.readAsDataURL(file);
  },

  async submitReview() {
    const mahd = document.getElementById("review-mahd").value;
    const macn = document.getElementById("review-macn").value;
    const sosao = document.getElementById("review-stars").value;
    const noidung = document.getElementById("review-content").value;
    const hinhanh = document.getElementById("review-image-base64").value;

    try {
      const res = await fetch(`${API_URL}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mahd,
          makh: this.user.id,
          macn,
          sosao,
          noidung,
          hinhanh
        })
      });
      const data = await res.json();
      if (data.success) {
        this.closeReviewModal();
        this.showPopup("Gửi đánh giá thành công! Cảm ơn bạn.", "success", () => {
          this.loadOrders();
        });
      } else {
        alert(data.message);
      }
    } catch (err) {
      console.error(err);
      alert("Lỗi kết nối máy chủ");
    }
  },

  async submitReviewReply(mahd) {
    const replyInput = document.getElementById(`reply-input-${mahd}`);
    if (!replyInput || !replyInput.value.trim()) {
      alert("Vui lòng nhập nội dung phản hồi!");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/reviews/${mahd}/reply`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phanhoi: replyInput.value.trim() })
      });
      const data = await res.json();
      if (data.success) {
        this.showPopup("Đã gửi phản hồi!", "success", () => {
          this.loadOrders();
        });
      } else {
        alert(data.message);
      }
    } catch (err) {
      console.error(err);
      alert("Lỗi kết nối máy chủ");
    }
  },

  // =====================================================================
  // NOTIFICATIONS — Polling + Render + Badge
  // =====================================================================
  pollNotifications() {
    const fetchNow = () => {
      if (!this.user) return;

      fetch(`${API_URL}/notifications?userid=${this.user.id}&role=${this.user.role}`)
        .then(res => res.ok ? res.json() : { success: false })
        .then(data => {
          if (data.success && data.data) {
            const unread = data.data.filter(n => !n.TRANGTHAI_DOC);
            const badge = document.getElementById("notification-badge");

            if (unread.length > 0) {
              if (badge) {
                badge.innerText = unread.length > 99 ? "99+" : unread.length;
                badge.style.display = "inline-block";
              }

              // Toast khi có thông báo mới
              if (this._lastUnreadCount !== undefined && unread.length > this._lastUnreadCount) {
                this.showToast(unread[0].NOIDUNG, "info");
              }
            } else {
              if (badge) badge.style.display = "none";
            }

            this._lastUnreadCount = unread.length;
            this.renderNotifications(data.data);
          }
        }).catch(() => { });
    };

    fetchNow(); // Quét ngay khi đăng nhập

    if (this.notiInterval) clearInterval(this.notiInterval);
    this.notiInterval = setInterval(fetchNow, 5000);

    window.addEventListener("focus", fetchNow);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") fetchNow();
    });
  },

  stopNotificationPolling() {
    if (this.notiInterval) {
      clearInterval(this.notiInterval);
      this.notiInterval = null;
    }
  },

  renderNotifications(notifications) {
    const list = document.getElementById("notification-list");
    const badge = document.getElementById("notification-badge");
    if (!list || !badge) return;

    let unreadCount = notifications.filter(n => !n.TRANGTHAI_DOC).length;
    if (unreadCount > 0) {
      badge.innerText = unreadCount > 99 ? "99+" : unreadCount;
      badge.style.display = "inline-block";
    } else {
      badge.style.display = "none";
    }

    if (notifications.length === 0) {
      list.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;">Chưa có thông báo nào</div>`;
      return;
    }

    list.innerHTML = notifications.map(n => {
      const isUnread = !n.TRANGTHAI_DOC;
      const bg = isUnread ? "var(--bg)" : "var(--bg-white)";
      const dot = isUnread ? `<span style="display:inline-block; width:8px; height:8px; background:var(--primary); border-radius:50%; margin-right:8px;"></span>` : "";
      const dateStr = new Date(n.NGAYTAO).toLocaleString('vi-VN');
      return `
        <div style="padding: 12px 15px; border-bottom: 1px solid var(--border-color); background: ${bg}; cursor: pointer; transition: 0.2s;" 
             onclick="app.markNotificationRead(${n.MATB}, event)" class="noti-item">
          <div style="font-size: 13px; color: var(--text-primary); margin-bottom: 4px; display: flex; align-items: flex-start;">
            <div style="margin-top: 3px;">${dot}</div>
            <div style="flex: 1; line-height: 1.4;">${n.NOIDUNG}</div>
          </div>
          <div style="font-size: 11px; color: var(--text-muted); text-align: right;">${dateStr}</div>
        </div>
      `;
    }).join("");
  },

  toggleNotifications(e) {
    e.stopPropagation();
    const dropdown = document.getElementById("notification-dropdown");
    if (dropdown) dropdown.classList.toggle("hidden");
  },

  async markNotificationRead(matb, e) {
    if (e) e.stopPropagation();
    try {
      await fetch(`${API_URL}/notifications/${matb}/read`, { method: "PUT" });

      const res = await fetch(`${API_URL}/notifications?userid=${this.user.id}&role=${this.user.role}`);
      const data = await res.json();

      if (data.success) {
        this.renderNotifications(data.data);
        const unread = data.data.filter(n => !n.TRANGTHAI_DOC);
        this._lastUnreadCount = unread.length;
        const badge = document.getElementById("notification-badge");
        if (badge) {
          badge.innerText = unread.length > 99 ? "99+" : unread.length;
          badge.style.display = unread.length > 0 ? "inline-block" : "none";
        }
      }
    } catch (err) {
      console.error("Lỗi read noti:", err);
    }
  },

  async markAllNotificationsRead(e) {
    if (e) e.stopPropagation();
    if (!this.user) return;
    try {
      await fetch(`${API_URL}/notifications/read-all`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userid: this.user.id, role: this.user.role })
      });

      this._lastUnreadCount = 0;
      const badge = document.getElementById("notification-badge");
      if (badge) badge.style.display = "none";

      const res = await fetch(`${API_URL}/notifications?userid=${this.user.id}&role=${this.user.role}`);
      const data = await res.json();
      if (data.success) {
        this.renderNotifications(data.data);
      }
    } catch (err) {
      console.error("Lỗi read-all:", err);
    }
  },

  // =====================================================================
  // TOAST NOTIFICATIONS & ALERT OVERRIDE
  // =====================================================================
  showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    let icon = type === "success" ? "fa-circle-check" : type === "error" ? "fa-circle-xmark" : "fa-circle-info";
    let color = type === "success" ? "var(--success)" : type === "error" ? "var(--danger)" : "var(--primary)";

    toast.innerHTML = `<i class="fa-solid ${icon}" style="color: ${color}; font-size: 20px;"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("slide-out");
      toast.addEventListener("animationend", () => toast.remove());
    }, 4000);
  },

  overrideNativeAlerts() {
    window.alert = (msg) => {
      if (msg && msg.toLowerCase().includes("thành công")) {
        this.showToast(msg, "success");
      } else {
        this.showToast(msg, "error");
      }
    };
    window.confirm = (msg) => true;
  },

  // =====================================================================
  // CUSTOM MODAL CENTER
  // =====================================================================
  showModal(title, message, isReportSuccess = false) {
    const modal = document.getElementById("custom-center-modal");
    if (!modal) return;
    document.getElementById("modal-title").innerText = title;
    document.getElementById("modal-message").innerText = message;

    const actionsDiv = document.getElementById("modal-actions");
    if (actionsDiv) {
      if (isReportSuccess) {
        actionsDiv.innerHTML = `<button class="btn-danger" style="margin: 0 auto; display: block;" onclick="app.logout(); app.closeModal();">Đăng xuất</button>`;
      } else {
        actionsDiv.innerHTML = `<button class="btn-ghost" style="margin: 0 auto; display: block;" onclick="app.closeModal()">Đóng</button>`;
      }
    }
    modal.classList.remove("hidden");
  },

  closeModal() {
    const modal = document.getElementById("custom-center-modal");
    if (modal) modal.classList.add("hidden");
  },
};

// Biến app là biến toàn cục
window.app = app;

// Initialize app on load
window.onload = () => app.init();
