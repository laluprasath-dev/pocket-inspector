import { ExportTargetType, ImageRole } from '../../../generated/prisma/enums';

/**
 * Centralised GCS path builder — single source of truth for all object paths.
 * All paths follow the conventions in docs/PocketInspector_Schema_Storage_API_Phase1_v4.md.
 */
export class StoragePathBuilder {
  // ── Door images ────────────────────────────────────────────────────────────

  static doorImageOriginal(params: {
    orgId: string;
    siteId: string | null;
    buildingId: string;
    floorId: string;
    doorId: string;
    role: ImageRole;
    imageId: string;
  }): string {
    return `${this.doorBase(params)}/images/original/${params.role.toLowerCase()}/${params.imageId}.jpg`;
  }

  static doorImageThumb(params: {
    orgId: string;
    siteId: string | null;
    buildingId: string;
    floorId: string;
    doorId: string;
    role: ImageRole;
    imageId: string;
  }): string {
    return `${this.doorBase(params)}/images/thumb/${params.role.toLowerCase()}/${params.imageId}.jpg`;
  }

  // ── Door certificate ───────────────────────────────────────────────────────

  static doorCertificate(params: {
    orgId: string;
    siteId: string | null;
    buildingId: string;
    floorId: string;
    doorId: string;
    certId: string;
  }): string {
    return `${this.doorBase(params)}/certificates/door/${params.certId}.pdf`;
  }

  // ── Building certificate ───────────────────────────────────────────────────

  static buildingCertificate(params: {
    orgId: string;
    siteId: string | null;
    buildingId: string;
    certId: string;
  }): string {
    return `${this.buildingBase(params)}/certificates/building/${params.certId}.pdf`;
  }

  // ── Export ZIP ─────────────────────────────────────────────────────────────

  static exportZip(params: {
    orgId: string;
    targetType: ExportTargetType;
    targetId: string;
    jobId: string;
  }): string {
    return `exports/${params.orgId}/${params.targetType.toLowerCase()}/${params.targetId}/${params.jobId}.zip`;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private static buildingBase(params: {
    orgId: string;
    siteId: string | null;
    buildingId: string;
  }): string {
    if (params.siteId) {
      return `orgs/${params.orgId}/sites/${params.siteId}/buildings/${params.buildingId}`;
    }
    return `orgs/${params.orgId}/buildings/${params.buildingId}`;
  }

  private static doorBase(params: {
    orgId: string;
    siteId: string | null;
    buildingId: string;
    floorId: string;
    doorId: string;
  }): string {
    return `${this.buildingBase(params)}/floors/${params.floorId}/doors/${params.doorId}`;
  }
}
