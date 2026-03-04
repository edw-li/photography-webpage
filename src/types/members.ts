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
  id?: number;
  src: string;
  caption?: string;
}

export interface Member {
  id?: number;
  name: string;
  specialty: string;
  avatar: string;
  photographyType?: string;
  leadershipRole?: string;
  website?: string;
  socialLinks?: SocialLinks;
  bio?: string;
  samplePhotos?: SamplePhoto[];
}

export interface MemberAdmin extends Member {
  userId?: string;
  email?: string;
  userRole?: string;
  isActive?: boolean;
}

export interface MembersConfig {
  members: Member[];
}
