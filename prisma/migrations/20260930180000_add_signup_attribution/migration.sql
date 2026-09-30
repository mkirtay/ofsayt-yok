-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firstTouchAt" TIMESTAMP(3),
ADD COLUMN     "signupUtmCampaign" TEXT,
ADD COLUMN     "signupUtmMedium" TEXT,
ADD COLUMN     "signupUtmSource" TEXT;

