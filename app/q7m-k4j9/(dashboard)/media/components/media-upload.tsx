"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ImageUploader } from "../../components/image-uploader";

export function MediaUpload() {
  const router = useRouter();
  const [value, setValue] = useState("");

  return (
    <ImageUploader
      value={value}
      onChange={(url) => setValue(url)}
      onUpload={() => {
        setValue("");
        router.refresh();
      }}
      label="Image"
      showMediaPicker={false}
    />
  );
}
