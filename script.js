const STORAGE_KEYS = {
  cart: "cartlane_cart",
  user: "cartlane_user"
};

let products = [];

const fallbackProducts = [
  { id: 1, name: "Aero Running Shoes", price: 79.99, category: "Footwear", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80" },
  { id: 2, name: "Urban Sling Bag", price: 42.5, category: "Accessories", image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=900&q=80" },
  { id: 3, name: "Noise-Cancel Headphones", price: 129.0, category: "Electronics", image: "https://images.unsplash.com/photo-1484704849700-f032a568e944?auto=format&fit=crop&w=900&q=80" },
  { id: 4, name: "Smartwatch S2", price: 159.99, category: "Wearables", image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80" },
  { id: 5, name: "Desk Lamp Minimal", price: 36.0, category: "Home", image: "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=900&q=80" },
  { id: 6, name: "Water Bottle Steel", price: 19.99, category: "Fitness", image: "https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=900&q=80" },
  { id: 7, name: "Cotton Hoodie", price: 54.0, category: "Apparel", image: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=900&q=80" },
  { id: 8, name: "Mechanical Keyboard", price: 88.75, category: "Electronics", image: "https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?auto=format&fit=crop&w=900&q=80" },
  { id: 9, name: "Portable Speaker", price: 65.25, category: "Audio", image: "https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=900&q=80" },
  { id: 10, name: "Classic Sunglasses", price: 31.4, category: "Accessories", image: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=80" }
];

const state = {
  cart: loadState(STORAGE_KEYS.cart, []),
  user: loadState(STORAGE_KEYS.user, null)
};

const productsGrid = document.getElementById("productsGrid");
const cartCount = document.getElementById("cartCount");
const cartPanel = document.getElementById("cartPanel");
const cartItems = document.getElementById("cartItems");
const subtotalEl = document.getElementById("subtotal");
const welcomeText = document.getElementById("welcomeText");
const openLoginBtn = document.getElementById("openLoginBtn");
const openSignupBtn = document.getElementById("openSignupBtn");
const logoutBtn = document.getElementById("logoutBtn");
const loginModal = document.getElementById("loginModal");
const loginTitle = document.getElementById("loginTitle");
const loginForm = document.getElementById("loginForm");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const loginMessage = document.getElementById("loginMessage");

let authMode = "login";

document.getElementById("openCartBtn").addEventListener("click", openCart);
document.getElementById("closeCartBtn").addEventListener("click", closeCart);
document.getElementById("closeLoginBtn").addEventListener("click", closeLoginModal);
document.getElementById("checkoutBtn").addEventListener("click", handleCheckout);
openLoginBtn.addEventListener("click", openLoginModal);
openSignupBtn.addEventListener("click", openSignupModal);
logoutBtn.addEventListener("click", logout);
loginForm.addEventListener("submit", login);

bootstrap();

async function bootstrap() {
  await loadProducts();
  renderProducts();
  renderCart();
  renderUser();
}

async function loadProducts() {
  try {
    const response = await fetch("/api/products");
    if (!response.ok) {
      throw new Error("Could not load products.");
    }
    const payload = await parseApiResponse(response);
    products = Array.isArray(payload) ? payload : [...fallbackProducts];
  } catch (error) {
    products = [...fallbackProducts];
  }
}

function renderProducts() {
  productsGrid.innerHTML = "";

  products.forEach((product, index) => {
    const card = document.createElement("article");
    card.className = "product-card";
    card.style.animationDelay = `${index * 60}ms`;

    card.innerHTML = `
      <img class="product-image" src="${product.image}" alt="${product.name}" loading="lazy" />
      <h4>${product.name}</h4>
      <p class="meta">${product.category}</p>
      <div class="price-row">
        <p class="price">$${Number(product.price).toFixed(2)}</p>
        <button class="btn btn-primary" data-product-id="${product.id}">Add</button>
      </div>
    `;

    productsGrid.append(card);
  });

  productsGrid.querySelectorAll("button[data-product-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const id = Number(event.currentTarget.dataset.productId);
      addToCart(id);
    });
  });
}

function addToCart(productId) {
  if (!state.user || !state.user.id) {
    openLoginModal();
    loginMessage.textContent = "Please login to add products to cart.";
    loginMessage.className = "helper-text error";
    return;
  }

  const found = state.cart.find((item) => item.productId === productId);
  if (found) {
    found.qty += 1;
  } else {
    state.cart.push({ productId, qty: 1 });
  }

  persistState(STORAGE_KEYS.cart, state.cart);
  renderCart();
  syncCartToServer();
}

function renderCart() {
  cartItems.innerHTML = "";

  if (state.cart.length === 0) {
    cartItems.innerHTML = "<p class='empty'>Your cart is empty.</p>";
    cartCount.textContent = "0";
    subtotalEl.textContent = "$0.00";
    return;
  }

  let subtotal = 0;
  let count = 0;

  state.cart.forEach((cartLine) => {
    const product = products.find((item) => item.id === cartLine.productId);
    if (!product) return;

    subtotal += Number(product.price) * Number(cartLine.qty);
    count += Number(cartLine.qty);

    const row = document.createElement("div");
    row.className = "cart-row";
    row.innerHTML = `
      <p><strong>${product.name}</strong></p>
      <p class="meta">$${Number(product.price).toFixed(2)} each</p>
      <div class="qty-actions">
        <button type="button" class="btn btn-ghost" data-action="dec" data-product-id="${product.id}">-</button>
        <span class="qty-pill">${cartLine.qty}</span>
        <button type="button" class="btn btn-ghost" data-action="inc" data-product-id="${product.id}">+</button>
        <button type="button" class="btn btn-ghost" data-action="rm" data-product-id="${product.id}">Remove</button>
      </div>
    `;
    cartItems.append(row);
  });

  cartCount.textContent = String(count);
  subtotalEl.textContent = `$${subtotal.toFixed(2)}`;

  cartItems.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const action = event.currentTarget.dataset.action;
      const productId = Number(event.currentTarget.dataset.productId);
      updateCartLine(productId, action);
    });
  });
}

function updateCartLine(productId, action) {
  const line = state.cart.find((item) => item.productId === productId);
  if (!line) return;

  if (action === "inc") line.qty += 1;
  if (action === "dec") line.qty -= 1;
  if (action === "rm") line.qty = 0;

  state.cart = state.cart.filter((item) => item.qty > 0);
  persistState(STORAGE_KEYS.cart, state.cart);
  renderCart();
  syncCartToServer();
}

function openCart() {
  cartPanel.classList.add("open");
  cartPanel.setAttribute("aria-hidden", "false");
}

function closeCart() {
  cartPanel.classList.remove("open");
  cartPanel.setAttribute("aria-hidden", "true");
}

function openLoginModal() {
  authMode = "login";
  loginTitle.textContent = "Login";
  authSubmitBtn.textContent = "Sign In";
  loginMessage.textContent = "";
  loginMessage.className = "helper-text";
  loginForm.reset();
  loginModal.classList.remove("hidden");
}

function openSignupModal() {
  authMode = "signup";
  loginTitle.textContent = "Sign Up";
  authSubmitBtn.textContent = "Create Account";
  loginMessage.textContent = "";
  loginMessage.className = "helper-text";
  loginForm.reset();
  loginModal.classList.remove("hidden");
}

function closeLoginModal() {
  loginModal.classList.add("hidden");
}

async function login(event) {
  event.preventDefault();
  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    loginMessage.textContent = "Please enter email and password.";
    loginMessage.className = "helper-text error";
    return;
  }

  try {
    const endpoint = authMode === "signup" ? "/api/signup" : "/api/login";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const payload = await parseApiResponse(response);
    if (!response.ok) {
      throw new Error(payload.message || `${authMode === "signup" ? "Sign up" : "Login"} failed.`);
    }

    if (!payload.user || !payload.user.id) {
      throw new Error("Invalid server response.");
    }

    state.user = payload.user;
    persistState(STORAGE_KEYS.user, state.user);
    loginMessage.textContent = authMode === "signup" ? "Account created successfully." : "Login successful.";
    loginMessage.className = "helper-text success";
    renderUser();
    syncCartToServer();
    setTimeout(closeLoginModal, 500);
  } catch (error) {
    loginMessage.textContent = error.message || "Login failed. Check server and try again.";
    loginMessage.className = "helper-text error";
  }
}

function logout() {
  state.user = null;
  persistState(STORAGE_KEYS.user, state.user);
  renderUser();
}

function renderUser() {
  if (state.user) {
    const displayName = getUserDisplayName(state.user);
    welcomeText.textContent = `${displayName} signed in`;
    openLoginBtn.classList.add("hidden");
    openSignupBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    return;
  }

  welcomeText.textContent = "Guest mode";
  openLoginBtn.classList.remove("hidden");
  openSignupBtn.classList.remove("hidden");
  logoutBtn.classList.add("hidden");
}

function getUserDisplayName(user) {
  if (user && user.name && String(user.name).trim()) {
    return String(user.name).trim();
  }
  if (user && user.email && String(user.email).includes("@")) {
    return String(user.email).split("@")[0];
  }
  return "User";
}

async function handleCheckout() {
  if (!state.user) {
    closeCart();
    openLoginModal();
    loginMessage.textContent = "Please login before checkout.";
    loginMessage.className = "helper-text error";
    return;
  }

  if (state.cart.length === 0) {
    alert("Your cart is empty.");
    return;
  }

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: state.user.id, items: state.cart })
    });

    const payload = await parseApiResponse(response);
    if (!response.ok) {
      throw new Error(payload.message || "Checkout failed.");
    }

    alert(`Order placed by ${state.user.email}. Order #${payload.order.id}`);
    state.cart = [];
    persistState(STORAGE_KEYS.cart, state.cart);
    renderCart();
    syncCartToServer();
    closeCart();
  } catch (error) {
    alert(error.message || "Checkout failed.");
  }
}

function syncCartToServer() {
  if (!state.user || !state.user.id) return;

  fetch("/api/cart/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: state.user.id, items: state.cart })
  }).catch(() => {
    // Keep UI responsive if network call fails.
  });
}

function loadState(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function persistState(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function parseApiResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch (error) {
    return { message: "Unexpected server response." };
  }
}
