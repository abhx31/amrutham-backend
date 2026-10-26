import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_NAMESPACE, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

let sdk: NodeSDK | undefined;

export function startTelemetry(defaultServiceName: string): void {
  if (process.env.OTEL_ENABLED !== "true" || sdk) return;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? "http://localhost:4318/v1/traces";
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? defaultServiceName,
      [ATTR_SERVICE_NAMESPACE]: "amrutam",
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? "0.1.0"
    }),
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    instrumentations: [getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false }
    })]
  });
  sdk.start();
}

export async function shutdownTelemetry(): Promise<void> {
  const activeSdk = sdk;
  sdk = undefined;
  await activeSdk?.shutdown();
}
