// Common types used across the application

export interface TandoorConfig {
  url: string;
  token: string;
}

export interface User {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
}
