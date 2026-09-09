export interface DriveFile {
  name: string;
  size: number;
  modifiedAt: string;
}

export interface DriveSummary {
  files: DriveFile[];
  usedBytes: number;
  quotaBytes: number;
  availableBytes: number;
  maxFileBytes: number;
}
