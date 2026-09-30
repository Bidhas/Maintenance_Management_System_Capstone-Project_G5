import LoginPage from "./pages/Login/LoginPage";

export default function App() {
  // TEMPORARY: while there's no backend/router yet, just log what the
  // login form collected. Once auth + routing exist, replace this with
  // a redirect to the right dashboard for `data.role`.
  function handleLogin(data) {
    console.log("Login submitted:", data);
    alert(`Signed in as ${data.role} (${data.identifier})`);
  }

  return <LoginPage onLogin={handleLogin} />;
}
