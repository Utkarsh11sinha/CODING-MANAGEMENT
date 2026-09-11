const ownerKeyInput = document.getElementById("ownerKey");
const loadDashboardBtn = document.getElementById("loadDashboardBtn");
const dashboard = document.getElementById("dashboard");
const adminMessage = document.getElementById("adminMessage");
const addProductForm = document.getElementById("addProductForm");

let ownerKey = "";

loadDashboardBtn.addEventListener("click", () => {
  ownerKey = ownerKeyInput.value.trim();
  if (!ownerKey) {
    setMessage("Enter owner key.", true);
    return;
  }
  fetchOverview();
});

addProductForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = {
      name: document.getElementById("newName").value.trim(),
      price: Number(document.getElementById("newPrice").value),
      category: document.getElementById("newCategory").value.trim(),
      image: document.getElementById("newImage").value.trim()
    };

    const response = await fetch(`/api/admin/products?key=${encodeURIComponent(ownerKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await parseApiResponse(response);
    if (!response.ok) throw new Error(data.message || "Could not add product.");

    addProductForm.reset();
    setMessage("Product added.", false);
    fetchOverview();
  } catch (error) {
    setMessage(error.message || "Could not add product.", true);
  }
});

async function fetchOverview() {
  try {
    const response = await fetch(`/api/admin/overview?key=${encodeURIComponent(ownerKey)}`);
    const data = await parseApiResponse(response);

    if (!response.ok) {
      throw new Error(data.message || "Could not load dashboard.");
    }

    dashboard.classList.remove("hidden");
    setMessage("Dashboard loaded.", false);
    renderOverview(data);
  } catch (error) {
    dashboard.classList.add("hidden");
    setMessage(error.message || "Could not load dashboard.", true);
  }
}

function renderOverview(data) {
  document.getElementById("totalProducts").textContent = String(data.totals.products);
  document.getElementById("totalUsers").textContent = String(data.totals.users);
  document.getElementById("totalOrders").textContent = String(data.totals.orders);

  const productsRoot = document.getElementById("adminProducts");
  const usersRoot = document.getElementById("adminUsers");
  const ordersRoot = document.getElementById("adminOrders");

  productsRoot.innerHTML = "";
  usersRoot.innerHTML = "";
  ordersRoot.innerHTML = "";

  if (data.products.length === 0) {
    productsRoot.innerHTML = "<p class='meta'>No products found.</p>";
  }

  data.products.forEach((product) => {
    const row = document.createElement("div");
    row.className = "cart-row";
    row.innerHTML = `
      <p><strong>#${product.id} - ${product.name}</strong></p>
      <p class="meta">${product.category} | $${Number(product.price).toFixed(2)}</p>
      <div class="qty-actions">
        <button class="btn btn-ghost" type="button" data-action="edit" data-id="${product.id}">Edit</button>
        <button class="btn btn-ghost" type="button" data-action="delete" data-id="${product.id}">Delete</button>
      </div>
    `;
    productsRoot.append(row);
  });

  productsRoot.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const action = event.currentTarget.dataset.action;
      const id = Number(event.currentTarget.dataset.id);

      if (action === "delete") {
        await deleteProduct(id);
      }

      if (action === "edit") {
        await editProduct(id, data.products.find((item) => item.id === id));
      }
    });
  });

  if (data.users.length === 0) {
    usersRoot.innerHTML = "<p class='meta'>No users yet.</p>";
  }

  data.users.forEach((user) => {
    const row = document.createElement("div");
    row.className = "cart-row";
    row.innerHTML = `
      <p><strong>${user.email}</strong></p>
      <p class="meta">User ID: ${user.id} | Joined: ${new Date(user.createdAt).toLocaleString()}</p>
      <div class="qty-actions">
        <button class="btn btn-ghost" type="button" data-action="delete-user" data-id="${user.id}">Delete User</button>
      </div>
    `;
    usersRoot.append(row);
  });

  usersRoot.querySelectorAll("button[data-action='delete-user']").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const id = Number(event.currentTarget.dataset.id);
      await deleteUser(id);
    });
  });

  if (data.orders.length === 0) {
    ordersRoot.innerHTML = "<p class='meta'>No orders yet.</p>";
  }

  data.orders
    .slice()
    .reverse()
    .forEach((order) => {
      const row = document.createElement("div");
      row.className = "cart-row";
      row.innerHTML = `
        <p><strong>Order #${order.id}</strong></p>
        <p class="meta">${order.userEmail} | ${new Date(order.createdAt).toLocaleString()}</p>
        <p class="meta">Items: ${order.items.length} | Total: $${Number(order.total).toFixed(2)}</p>
      `;
      ordersRoot.append(row);
    });
}

async function deleteProduct(productId) {
  if (!confirm("Delete this product?")) return;

  try {
    const response = await fetch(`/api/admin/products/${productId}?key=${encodeURIComponent(ownerKey)}`, {
      method: "DELETE"
    });
    const data = await parseApiResponse(response);
    if (!response.ok) throw new Error(data.message || "Delete failed.");

    setMessage("Product deleted.", false);
    fetchOverview();
  } catch (error) {
    setMessage(error.message || "Delete failed.", true);
  }
}

async function editProduct(productId, current) {
  const nextName = prompt("Product name", current.name);
  if (nextName === null) return;

  const nextPrice = prompt("Price", String(current.price));
  if (nextPrice === null) return;

  const nextCategory = prompt("Category", current.category);
  if (nextCategory === null) return;

  const nextImage = prompt("Image URL", current.image);
  if (nextImage === null) return;

  try {
    const response = await fetch(`/api/admin/products/${productId}?key=${encodeURIComponent(ownerKey)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nextName.trim(),
        price: Number(nextPrice),
        category: nextCategory.trim(),
        image: nextImage.trim()
      })
    });

    const data = await parseApiResponse(response);
    if (!response.ok) throw new Error(data.message || "Update failed.");

    setMessage("Product updated.", false);
    fetchOverview();
  } catch (error) {
    setMessage(error.message || "Update failed.", true);
  }
}

async function deleteUser(userId) {
  if (!confirm("Delete this user account? They will need to sign up again.")) return;

  try {
    const response = await fetch(`/api/admin/users/${userId}?key=${encodeURIComponent(ownerKey)}`, {
      method: "DELETE"
    });
    const data = await parseApiResponse(response);
    if (!response.ok) throw new Error(data.message || "User delete failed.");

    setMessage("User deleted.", false);
    fetchOverview();
  } catch (error) {
    setMessage(error.message || "User delete failed.", true);
  }
}

function setMessage(message, isError) {
  adminMessage.textContent = message;
  adminMessage.className = isError ? "helper-text error" : "helper-text success";
}

async function parseApiResponse(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return { message: "Unexpected server response." };
  }
}
