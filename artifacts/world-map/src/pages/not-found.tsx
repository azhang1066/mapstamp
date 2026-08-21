import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-foreground">Page not found</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            This page doesn&apos;t exist or may have moved.
          </p>
          <Link href="/" className="mt-5 inline-block text-sm font-medium text-blue-700 hover:underline">
            Return to the world map
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
