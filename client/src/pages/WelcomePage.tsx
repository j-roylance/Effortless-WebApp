import { useNavigate } from "react-router-dom";

export function WelcomePage() {
  const navigate = useNavigate();

  return (
    <div className="welcome-page">
      <div className="welcome-page-center">
        <h1 className="welcome-page-title">Let&apos;s make your life vision and goals!</h1>
        <button
          type="button"
          className="welcome-page-begin neon-btn neon-btn-primary"
          onClick={() => navigate("/ai")}
        >
          Click to begin
        </button>
      </div>

      <button
        type="button"
        className="welcome-page-skip"
        onClick={() => navigate("/")}
      >
        I already have goals
      </button>
    </div>
  );
}
