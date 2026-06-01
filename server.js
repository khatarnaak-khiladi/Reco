const express = require("express");

const app = express();

app.get("/", (req, res) => {
  res.send("Railway backend working");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Backend is running",
    timestamp: Date.now()
  });
});

app.get("/test", (req, res) => {
  res.json({
    success: true,
    railway: true
  });
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("=================================");
  console.log("Railway backend started");
  console.log(`Listening on port ${PORT}`);
  console.log("=================================");
});
