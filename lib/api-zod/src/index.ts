export * from "./generated/api";
// Re-export TS interfaces, excluding SaveMapDataResponse which collides with the Zod schema
export type {
  DeletePhotoResponse,
  ErrorEnvelope,
  HealthStatus,
  ListPhotosParams,
  MapDataEnvelope,
  MapDataPayload,
  MapDataPayloadCountryDetails,
  MapDataPayloadNotesByKey,
  MapDataPayloadParkDetails,
  MapDataPayloadProvinceDetails,
  MapDataPayloadStadiumDetails,
  MapDataPayloadStateDetails,
  MapDataPayloadTccDetails,
  PhotoListResponse,
  PhotoRecord,
  UpdatePhotoBody,
  UploadPhotoBody,
} from "./generated/types";
