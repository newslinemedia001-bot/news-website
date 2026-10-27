import { supabase } from "./supabase.js";

const message = document.getElementById("authMessage");

function showMessage(text, error = false) {
  message.textContent = text;
  message.className = `auth-message ${error ? "error" : "success"}`;
}

const loginForm = document.getElementById("loginForm");

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    showMessage("Signing in…");

    const { error } = await supabase.auth.signInWithPassword({
      email: document.getElementById("email").value.trim(),
      password: document.getElementById("password").value
    });

    if (error) {
      showMessage(error.message, true);
      return;
    }

    window.location.href = "/dashboard.html";
  });
}

const signupForm = document.getElementById("signupForm");

if (signupForm) {
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const fullName = document.getElementById("fullName").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    showMessage("Creating account…");

    const redirectTo = `${window.location.origin}${window.location.pathname.replace(/[^/]+$/, "")}login.html`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: redirectTo
      }
    });

    if (error) {
      showMessage(error.message, true);
      return;
    }

    if (data.session) {
      window.location.href = "/dashboard.html";
      return;
    }

    showMessage(
      "Account created. Check your email to confirm the account, then sign in."
    );
  });
}
