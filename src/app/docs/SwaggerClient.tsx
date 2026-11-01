"use client";

import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

export default function SwaggerClient() {
  return <SwaggerUI url="/api/openapi.json" docExpansion="list" />;
}
