import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
let accessToken = "";
let posts = [];
let users = [];

function esc(value = "") { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function msg(text, error = false) { const box = $("adminMessage"); box.textContent = text; box.className = `dashboard-message ${error ? "error" : "success"}`; }
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Admin request failed.");
  return data;
}
function articleUrl(kind, id, title) { const slug = String(title || "news").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-+/g, "-").slice(0, 90).replace(/-+$/g, "") || "news"; return `/news/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/${slug}`; }
function authorName(id) { const u = users.find(x => String(x.id) === String(id)); return u?.full_name || u?.email || "Unknown"; }
function renderPending() {
  const pending = posts.filter(p => p.approval_status === "pending");
  $("pendingCount").textContent = String(pending.length);
  $("pendingPosts").innerHTML = pending.length ? pending.map(p => `<article class="manage-card"><div class="manage-image">${p.image_url ? `<img src="${esc(p.image_url)}" alt="">` : `<div class="no-image">No image</div>`}</div><div class="manage-body"><div class="manage-meta"><span class="status pending">pending approval</span><span class="category">${esc(p.category || "")}</span></div><h3>${esc(p.title)}</h3><p>${esc(p.summary || "")}</p><small>By ${esc(authorName(p.author_id))}</small><div class="manage-actions"><button class="primary-button" data-approve="${esc(p.id)}">Approve & publish</button><button class="outline-button" data-reject="${esc(p.id)}">Reject</button></div></div></article>`).join("") : `<div class="empty-state"><h3>No pending posts.</h3><p>User submissions will appear here for approval.</p></div>`;
}
function renderPosts() {
  $("postsTable").innerHTML = posts.map(p => `<tr><td>${esc(p.title)}</td><td>${esc(authorName(p.author_id))}</td><td><select data-status="${esc(p.id)}"><option value="published" ${p.status === "published" ? "selected" : ""}>published</option><option value="pending" ${p.approval_status === "pending" ? "selected" : ""}>pending approval</option><option value="draft" ${p.status === "draft" && p.approval_status !== "pending" ? "selected" : ""}>draft/rejected</option></select></td><td>${esc(p.category || "")}</td><td><a class="read-article" href="${articleUrl("community", p.id, p.title)}" target="_blank">View</a> <button class="delete-post outline-button" data-delete-post="${esc(p.id)}">Delete</button></td></tr>`).join("");
}
function renderUsers() {
  $("usersTable").innerHTML = users.map(u => `<tr><td>${esc(u.full_name || "")}</td><td>${esc(u.email || "")}</td><td><select data-role="${esc(u.id)}"><option value="user" ${u.role === "user" ? "selected" : ""}>user</option><option value="author" ${u.role === "author" ? "selected" : ""}>author</option><option value="admin" ${u.role === "admin" ? "selected" : ""}>admin</option></select></td><td>${u.created_at ? esc(new Date(u.created_at).toLocaleDateString()) : ""}</td><td><button class="delete-user outline-button" data-delete-user="${esc(u.id)}">Delete</button></td></tr>`).join("");
}
async function refresh() { [users, posts] = await Promise.all([api("/api/admin/users"), api("/api/admin/posts")]); renderUsers(); renderPosts(); renderPending(); }

$("pendingPosts").addEventListener("click", async e => {
  const approve = e.target.closest("[data-approve]"); const reject = e.target.closest("[data-reject]");
  try {
    if (approve) { await api("/api/admin/posts", { method: "PATCH", body: JSON.stringify({ id: approve.dataset.approve, status: "published", approval_status: "approved" }) }); msg("Post approved and published."); await refresh(); }
    if (reject) { await api("/api/admin/posts", { method: "PATCH", body: JSON.stringify({ id: reject.dataset.reject, status: "draft", approval_status: "rejected" }) }); msg("Post rejected and returned to draft."); await refresh(); }
  } catch (e) { msg(e.message, true); }
});
$("postsTable").addEventListener("change", async e => { const select = e.target.closest("[data-status]"); if (!select) return; try { await api("/api/admin/posts", { method: "PATCH", body: JSON.stringify({ id: select.dataset.status, status: select.value === "pending" ? "draft" : select.value, approval_status: select.value === "published" ? "approved" : (select.value === "pending" ? "pending" : "rejected") }) }); msg("Post status updated."); await refresh(); } catch (e) { msg(e.message, true); } });
$("postsTable").addEventListener("click", async e => { const button = e.target.closest("[data-delete-post]"); if (!button || !confirm("Delete this post?")) return; try { await api(`/api/admin/posts?id=${encodeURIComponent(button.dataset.deletePost)}`, { method: "DELETE" }); msg("Post deleted."); await refresh(); } catch (e) { msg(e.message, true); } });
$("usersTable").addEventListener("change", async e => { const select = e.target.closest("[data-role]"); if (!select) return; try { await api("/api/admin/users", { method: "PATCH", body: JSON.stringify({ id: select.dataset.role, role: select.value }) }); msg("User role updated."); await refresh(); } catch (e) { msg(e.message, true); await refresh(); } });
$("usersTable").addEventListener("click", async e => { const button = e.target.closest("[data-delete-user]"); if (!button || !confirm("Delete this user account?")) return; try { await api(`/api/admin/users?id=${encodeURIComponent(button.dataset.deleteUser)}`, { method: "DELETE" }); msg("User deleted."); await refresh(); } catch (e) { msg(e.message, true); } });
$("addUserForm").addEventListener("submit", async e => { e.preventDefault(); try { await api("/api/admin/users", { method: "POST", body: JSON.stringify({ full_name: $("newUserName").value.trim(), email: $("newUserEmail").value.trim(), password: $("newUserPassword").value, role: $("newUserRole").value }) }); e.target.reset(); msg("User created successfully."); await refresh(); } catch (e) { msg(e.message, true); } });
$("logoutBtn").addEventListener("click", async () => { await supabase.auth.signOut(); window.location.href = "/"; });

(async function init() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) { window.location.href = "/login.html"; return; }
  accessToken = data.session.access_token;
  $("adminEmail").textContent = data.session.user.email || "";
  try { await refresh(); } catch (e) { msg(e.message, true); if (e.message.toLowerCase().includes("admin")) setTimeout(() => window.location.href = "/dashboard.html", 1200); }
})();
