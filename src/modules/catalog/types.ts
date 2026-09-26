export type CategoryRow = {
  id: string;
  code: string;
  name: string;
  sub_category: boolean;
  parent_id: string | null;
  parent_code: string | null;
  parent_name: string | null;
  thumbnail_url: string | null;
  created_at?: Date;
  updated_at?: Date;
};

export type PackageCategory = {
  code: string;
  name: string;
  isSubcategory: boolean;
  parentCode: string;
  parentName: string;
};

export type PackageRow = {
  id: string;
  package_code: string;
  hero_title: string;
  short_title: string | null;
  brand_name: string | null;
  days: number | null;
  avg_cost: string | null;
  pickup: string | null;
  best_time: string | null;
  climate: string | null;
  suitable: string | null;
  thumbnail_url: string | null;
  highlights: string | null;
  overview: string | null;
  includes_text: string | null;
  excludes_text: string | null;
  note: string | null;
  hero_images_json: string | null;
  related_package_codes_json: string | null;
  categories: PackageCategory[] | string | null;
  created_at?: Date;
  updated_at?: Date;
};

export type ItineraryRow = {
  day_number: number;
  title: string | null;
  description: string | null;
};
