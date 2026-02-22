export interface SocialLinks {
  instagram?: string;
  twitter?: string;
  flickr?: string;
  facebook?: string;
  youtube?: string;
  linkedin?: string;
  [key: string]: string | undefined;
}

export interface SamplePhoto {
  src: string;
  caption?: string;
}

export interface Member {
  name: string;
  specialty: string;
  avatar: string;
  photographyType?: string;
  website?: string;
  socialLinks?: SocialLinks;
  bio?: string;
  samplePhotos?: SamplePhoto[];
}

export interface MembersConfig {
  members: Member[];
}
